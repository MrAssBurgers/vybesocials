import { createHash } from 'node:crypto';
import { FieldPath, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

type Row = Record<string, unknown>;
export type ReportTargetType = 'profile' | 'post' | 'comment' | 'mini_app';
export interface ReportActor { uid: string; profileId: string; }
export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'hate', 'impersonation', 'other', 'blocked_user'] as const;
const TARGETS: ReportTargetType[] = ['profile', 'post', 'comment', 'mini_app'];
const STATUSES = ['pending', 'reviewed', 'dismissed', 'actioned'] as const;
const immutable = ['reporter_uid', 'reporter_id', 'target_type', 'target_id', 'target_owner_uid', 'target_owner_profile_id', 'reason', 'details', 'created_at', 'target_revision'] as const;
export const reportHash = (...parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && !Array.from(value).some(char => char.charCodeAt(0) < 32) && value !== '.' && value !== '..';
export function reportId(value: unknown): string {
  if (!validId(value)) throw new HttpsError('invalid-argument', 'Invalid report or content identity');
  return value;
}
export function reportText(value: unknown, max: number, required = false): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new HttpsError('invalid-argument', 'Invalid report text');
  return value.trim();
}
const text = (value: unknown, max = 1000) => typeof value === 'string' ? value.slice(0, max) : '';
const iso = (value: unknown): string | null => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  try { return new Date(value).toISOString(); } catch { return null; }
};
export function reportRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'A stable request identity is required');
  return value;
}

/** An old browser-authored schema/verified flag cannot substitute for proof. */
export function isAttestedReport(row: Row | undefined, authority: Row | undefined): boolean {
  if (!row || !authority || row.schema_version !== 2 || authority.version !== 1 || !validId(row.id) || authority.report_id !== row.id) return false;
  if (![row.reporter_uid, row.reporter_id, row.target_id, row.target_owner_uid, row.target_owner_profile_id].every(validId)
    || !TARGETS.includes(row.target_type as ReportTargetType) || !REPORT_REASONS.includes(row.reason as typeof REPORT_REASONS[number])
    || typeof row.details !== 'string' || row.details.length > 1000 || typeof row.created_at !== 'string' || iso(row.created_at) !== row.created_at
    || !(row.target_revision === null || (typeof row.target_revision === 'string' && /^[a-f0-9]{64}$/.test(row.target_revision)))) return false;
  return immutable.every(key => row[key] === authority[key]);
}

/** Resolve and verify the current profile in the same transaction as the action. */
export async function reportActor(tx: Transaction, db: Firestore, uid: string): Promise<ReportActor> {
  reportId(uid);
  const index = await tx.get(db.doc(`user_auth_index/${uid}`));
  const indexed = index.data()?.profile_id;
  if (index.exists) {
    if (!validId(indexed)) throw new HttpsError('failed-precondition', 'Profile identity needs repair');
    const profile = await tx.get(db.doc(`profiles/${indexed}`));
    if (!profile.exists || profile.data()?.user_id !== uid) throw new HttpsError('failed-precondition', 'Profile identity needs repair');
    return unambiguousActor(tx, db, uid, indexed);
  }
  const rows = await tx.get(db.collection('profiles').where('user_id', '==', uid).limit(2));
  if (rows.size !== 1) throw new HttpsError('failed-precondition', 'A verified profile is required');
  return unambiguousActor(tx, db, uid, rows.docs[0].id);
}

async function unambiguousActor(tx: Transaction, db: Firestore, uid: string, profileId: string): Promise<ReportActor> {
  if (profileId !== uid) {
    const [uidProfile, profileUid] = await Promise.all([
      tx.get(db.doc(`profiles/${uid}`)),
      tx.get(db.collection('profiles').where('user_id', '==', profileId).limit(1)),
    ]);
    // Legacy profile aliases must never borrow a different account's UID grant.
    if ((uidProfile.exists && uidProfile.data()?.user_id !== uid) || !profileUid.empty) throw new HttpsError('failed-precondition', 'Profile identity is ambiguous');
  }
  return { uid, profileId };
}

export async function reportStaff(tx: Transaction, db: Firestore, uid: string): Promise<ReportActor> {
  const actor = await reportActor(tx, db, uid);
  const aliases = [...new Set([actor.uid, actor.profileId])];
  const grants = await Promise.all(['user_roles', 'user_roles_auth'].map(name => tx.get(db.collection(name).where('user_id', 'in', aliases).limit(21))));
  if (grants.some(rows => rows.size > 20)) throw new HttpsError('failed-precondition', 'Staff grants need review');
  const active = grants.some(rows => rows.docs.some(doc => {
    const row = doc.data();
    return aliases.includes(row.user_id) && ['owner', 'admin', 'moderator'].includes(row.role)
      && (!Object.hasOwn(row, 'enabled') || row.enabled === true);
  }));
  if (!active) throw new HttpsError('permission-denied', 'An active moderation role is required');
  return actor;
}

async function targetIdentity(tx: Transaction, db: Firestore, id: string): Promise<ReportActor> {
  const direct = await tx.get(db.doc(`profiles/${id}`));
  if (direct.exists) {
    const uid = direct.data()?.user_id;
    if (!validId(uid)) throw new HttpsError('failed-precondition', 'Target identity cannot be verified');
    const canonical = await reportActor(tx, db, uid);
    if (canonical.profileId !== direct.id) throw new HttpsError('failed-precondition', 'Target identity is not canonical');
    return canonical;
  }
  return reportActor(tx, db, id);
}

export async function reportTarget(tx: Transaction, db: Firestore, type: ReportTargetType, id: string) {
  const identity = type === 'profile' ? await targetIdentity(tx, db, id) : null;
  const canonicalId = identity?.profileId || id;
  const collection = { profile: 'profiles', post: 'posts', comment: 'comments', mini_app: 'mini_apps' }[type];
  const snapshot = await tx.get(db.collection(collection).doc(canonicalId));
  const row = snapshot.data();
  if (!row || row.deleted_at || row.is_deleted === true || (type === 'mini_app' && row.status !== 'published')) throw new HttpsError('not-found', 'Reported content is unavailable');
  const owner = identity || (type === 'mini_app'
    ? await reportActor(tx, db, reportId(row.owner_id))
    : await targetIdentity(tx, db, reportId(row.author_id ?? row.user_id)));
  if (type === 'mini_app' && row.owner_id !== owner.uid) throw new HttpsError('failed-precondition', 'Mini app ownership cannot be verified');
  if (type !== 'profile' && type !== 'mini_app' && row.author_id != null && row.user_id != null
    && ![owner.uid, owner.profileId].includes(row.user_id)) throw new HttpsError('failed-precondition', 'Content ownership is inconsistent');
  if (type === 'comment') {
    const parent = await tx.get(db.doc(`posts/${reportId(row.post_id)}`));
    if (!parent.exists || parent.data()?.deleted_at || parent.data()?.is_deleted === true) throw new HttpsError('not-found', 'Comment target is unavailable');
  }
  return { type, id: canonicalId, owner, snapshot, row, revision: type === 'mini_app' ? miniAppRevision(snapshot) : null };
}

/** Native update time detects changed writes and deletion/recreation. A true
 * no-op can retain its timestamp and represents the same inspected content. */
export function miniAppRevision(snapshot: DocumentSnapshot): string {
  return reportHash(snapshot.id, snapshot.updateTime?.seconds, snapshot.updateTime?.nanoseconds, snapshot.data());
}

export function reportSummary(id: string, value: Row | undefined, authority?: Row) {
  const row = value || {};
  const verified = row.id === id && isAttestedReport(row, authority);
  let targetType = TARGETS.includes(row.target_type as ReportTargetType) ? row.target_type as ReportTargetType : null;
  let targetId = validId(row.target_id) ? row.target_id : null;
  if (!verified && (!targetType || !targetId)) {
    if (row.content_type === 'mini_app' && validId(row.content_id)) { targetType = 'mini_app'; targetId = row.content_id; }
    else if (validId(row.comment_id)) { targetType = 'comment'; targetId = row.comment_id; }
    else if (validId(row.post_id)) { targetType = 'post'; targetId = row.post_id; }
    else if (validId(row.reported_user_id)) { targetType = 'profile'; targetId = row.reported_user_id; }
  }
  return {
    id, verification: verified ? 'verified' as const : 'legacy' as const,
    targetType, targetId, reporterId: validId(row.reporter_id) ? row.reporter_id : null,
    reporterUid: verified ? row.reporter_uid as string : null,
    targetOwnerUid: verified ? row.target_owner_uid as string : null,
    reason: text(row.reason, 240) || 'Unspecified legacy report', details: text(row.details || row.description),
    status: STATUSES.includes(row.status as typeof STATUSES[number]) ? row.status as typeof STATUSES[number] : 'unknown' as const,
    createdAt: iso(row.created_at), reviewedAt: iso(row.reviewed_at), reviewedBy: validId(row.reviewed_by) ? row.reviewed_by : null,
    adminNotes: text(row.admin_notes),
  };
}

export async function readReport(tx: Transaction, db: Firestore, id: string) {
  const [snapshot, proof] = await Promise.all([tx.get(db.doc(`reports/${id}`)), tx.get(db.doc(`_report_authority/${id}`))]);
  if (!snapshot.exists) throw new HttpsError('not-found', 'Report is unavailable');
  return { snapshot, row: snapshot.data()!, summary: reportSummary(id, snapshot.data(), proof.data()) };
}

export function holdSummary(value: Row | undefined, appId: string) {
  if (!value) return null;
  if (value.version !== 1 || value.app_id !== appId || !validId(value.owner_uid) || typeof value.active !== 'boolean' || typeof value.audit_id !== 'string' || !/^[a-f0-9]{64}$/.test(value.audit_id)) throw new HttpsError('failed-precondition', 'Moderation hold needs review');
  return { active: value.active, revision: value.audit_id, note: text(value.note), removedAt: iso(value.removed_at), releasedAt: iso(value.released_at) };
}

export async function inspectReport(tx: Transaction, db: Firestore, id: string) {
  const loaded = await readReport(tx, db, id);
  const { targetType, targetId } = loaded.summary;
  let target = { type: targetType, id: targetId, ownerUid: null as string | null, available: false, title: 'Content unavailable', caption: null as string | null, revision: null as string | null };
  let source: Row | undefined;
  let hold: ReturnType<typeof holdSummary> = null;
  if (targetType && targetId) {
    if (targetType === 'mini_app') hold = holdSummary((await tx.get(db.doc(`_mini_app_moderation/${targetId}`))).data(), targetId);
    try {
      const actual = await reportTarget(tx, db, targetType, targetId);
      // Keep a legacy report's alias as its inspection identity. Ownership is
      // resolved canonically, but clients must see the same lead they requested.
      target = { type: targetType, id: targetId, ownerUid: actual.owner.uid, available: true, title: text(actual.row.title || actual.row.display_name || actual.row.username, 120) || 'Reported content', caption: text(actual.row.caption || actual.row.text || actual.row.content) || null, revision: actual.revision };
      if (targetType === 'mini_app') source = { title: text(actual.row.title, 60), description: text(actual.row.description, 240), category: ['game', 'tool', 'art'].includes(String(actual.row.category)) ? actual.row.category : 'tool', html: text(actual.row.html, 100000), css: text(actual.row.css, 100000), javascript: text(actual.row.javascript, 100000) };
    } catch (error) {
      if (!(error instanceof HttpsError) || !['not-found', 'failed-precondition', 'invalid-argument'].includes(error.code)) throw error;
    }
  }
  return { report: loaded.summary, target: { ...target, ...(source ? { source } : {}) }, hold };
}

/** Read every quota before queuing any write; retries consume quota only once. */
export async function reportQuota(tx: Transaction, db: Firestore, uid: string, kind: 'submit' | 'moderate' | 'read', now: number) {
  const ref = db.doc(`_report_quotas/${reportHash(uid, kind)}`);
  const row = (await tx.get(ref)).data();
  const limits = kind === 'submit' ? [5, 20] : kind === 'moderate' ? [30, 300] : [120, 5000];
  const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
  if (row && (row.version !== 1 || row.uid !== uid || row.kind !== kind || !['minute', 'day', 'minute_count', 'day_count'].every(key => Number.isSafeInteger(row[key]) && row[key] >= 0))) throw new HttpsError('failed-precondition', 'Report quota needs review');
  const minuteCount = row?.minute === minute ? row.minute_count : 0;
  const dayCount = row?.day === day ? row.day_count : 0;
  if (minuteCount >= limits[0] || dayCount >= limits[1]) throw new HttpsError('resource-exhausted', 'Report limit reached. Please try again later.');
  return () => tx.set(ref, { version: 1, uid, kind, minute, day, minute_count: minuteCount + 1, day_count: dayCount + 1 });
}

export async function listReports(tx: Transaction, db: Firestore, input: Row) {
  const limit = input.limit == null ? 25 : input.limit;
  if (!Number.isInteger(limit) || typeof limit !== 'number' || limit < 1 || limit > 50) throw new HttpsError('invalid-argument', 'List limit must be between 1 and 50');
  let query = db.collection('reports').orderBy(FieldPath.documentId()).limit(limit + 1);
  if (input.status != null) {
    if (!STATUSES.includes(input.status as typeof STATUSES[number])) throw new HttpsError('invalid-argument', 'Invalid report status');
    query = query.where('status', '==', input.status);
  }
  if (input.cursor != null) query = query.startAfter(reportId(input.cursor));
  const rows = await tx.get(query);
  const page = rows.docs.slice(0, limit);
  const proofs = await Promise.all(page.map(row => tx.get(db.doc(`_report_authority/${row.id}`))));
  return { reports: page.map((row, i) => reportSummary(row.id, row.data(), proofs[i].data())), nextCursor: rows.size > limit ? page.at(-1)!.id : null };
}

export function assertReportFields(input: Row, fields: string[]) {
  if (Object.keys(input).some(key => !['action', ...fields].includes(key))) throw new HttpsError('invalid-argument', 'Unexpected report fields');
}
