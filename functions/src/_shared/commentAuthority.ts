import { createHash, randomBytes } from 'node:crypto';
import { FieldPath, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { admitSocialPost } from './socialFeedAuthority.js';
import { resolveIdentity, validAudienceId, type AudienceIdentity, type AudienceRow } from './profileAudienceAuthority.js';

const PAGE = 20, CURSOR_TTL = 600000;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable = () => new HttpsError('permission-denied', 'This discussion is no longer available. Refresh the post.');
type Binding = { expectedOwnerUid: string; expectedProfileId: string };
function input(raw: unknown, uid: string, keys: string[]): AudienceRow & Binding {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Comment details are required.');
  const row = raw as AudienceRow & Binding;
  if (row.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen this discussion.');
  if (!validAudienceId(row.expectedProfileId) || Object.keys(row).some(key => !['expectedOwnerUid', 'expectedProfileId', ...keys].includes(key))) throw new HttpsError('invalid-argument', 'Invalid comment details.');
  return row;
}
async function viewerIdentity(db: Firestore, tx: Transaction, uid: string, row: Binding) {
  const viewer = await resolveIdentity(db, tx, uid);
  if (!viewer || viewer.uid !== uid || viewer.profileId !== row.expectedProfileId) throw new HttpsError('failed-precondition', 'Your profile changed. Reopen this discussion.');
  return viewer;
}
function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const isoDate = (value: unknown): string | null => value instanceof Timestamp ? value.toDate().toISOString()
  : typeof value === 'string' && value.length <= 32 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
function sourceFingerprint(row: AudienceRow) {
  return hash([row.user_id ?? null, row.author_id ?? null, row.post_id, row.text, row.image_url ?? null, isoDate(row.created_at)]);
}
function activeRow(row: AudienceRow) {
  return !row.deleted_at && !row.is_deleted && !row.is_hidden && !row.is_removed && !row.removed_at
    && (row.status === undefined || row.status === 'published')
    && (row.moderation_status === undefined || row.moderation_status === 'approved');
}
async function commentOwner(db: Firestore, tx: Transaction, row: AudienceRow) {
  const alias = row.user_id ?? row.author_id;
  if (!validAudienceId(alias)) return null;
  const owner = await resolveIdentity(db, tx, alias);
  return owner && ['user_id', 'author_id'].every(key => row[key] === undefined || (typeof row[key] === 'string' && owner.aliases.includes(row[key] as string))) ? owner : null;
}
function proven(row: AudienceRow, proof: AudienceRow | undefined, owner: AudienceIdentity, id: string) {
  return proof?.version === 1 && proof.status === 'active' && proof.comment_id === id && proof.owner_uid === owner.uid
    && proof.profile_id === owner.profileId && proof.post_id === row.post_id && typeof proof.revision === 'string' && /^[a-f0-9]{48}$/.test(proof.revision)
    && proof.source_fingerprint === sourceFingerprint(row);
}
async function blocked(db: Firestore, tx: Transaction, first: AudienceIdentity, second: AudienceIdentity) {
  if (first.uid === second.uid) return false;
  const pairs = await Promise.all([
    tx.get(db.collection('blocked_users').where('blocker_id', 'in', first.aliases).where('blocked_id', 'in', second.aliases).limit(1)),
    tx.get(db.collection('blocked_users').where('blocker_id', 'in', second.aliases).where('blocked_id', 'in', first.aliases).limit(1)),
  ]);
  return pairs.some(pair => !pair.empty);
}
async function projectComment(db: Firestore, tx: Transaction, viewer: AudienceIdentity, id: string, row: AudienceRow, proof: AudienceRow | undefined) {
  if (!validAudienceId(id) || !activeRow(row)) return null;
  const owner = await commentOwner(db, tx, row);
  if (!owner || await blocked(db, tx, viewer, owner)) return null;
  const trusted = proven(row, proof, owner, id);
  // The old rules allowed reassignment. Reading a plausible legacy row must
  // never attest it. Only its claimed owner can deliberately replace/delete it.
  if (!trusted && owner.uid !== viewer.uid) return null;
  if (proof?.status === 'deleted') return null;
  const text = row.text ?? '', image = row.image_url == null ? null : httpsUrl(row.image_url), created = isoDate(row.created_at);
  if (typeof text !== 'string' || text.length > 4000 || (!text.trim() && !image) || (row.image_url && !image)
    || !created || typeof owner.row.username !== 'string' || !owner.row.username.trim() || owner.row.username.length > 100) return null;
  const [likes, mine] = await Promise.all([
    tx.get(db.collection('comment_likes').where('comment_id', '==', id).count()),
    tx.get(db.collection('comment_likes').where('comment_id', '==', id).where('user_id', 'in', viewer.aliases).limit(1)),
  ]);
  return { id, postId: row.post_id as string, text, imageUrl: image, createdAt: created,
    revision: trusted ? proof!.revision as string : null, needsOwnerConfirmation: !trusted,
    isFlagged: row.is_flagged === true, safetyScore: typeof row.safety_score === 'number' && Number.isFinite(row.safety_score) ? Math.max(0, Math.min(1, row.safety_score)) : 0,
    safetyCategories: Array.isArray(row.safety_categories) ? row.safety_categories.filter((value): value is string => typeof value === 'string' && value.length <= 80).slice(0, 20) : [],
    likeCount: likes.data().count, isLiked: !mine.empty,
    user: { id: owner.profileId, username: owner.row.username, avatarUrl: httpsUrl(owner.row.avatar_url) } };
}
export async function readPostCommentsPage(db: Firestore, uid: string, raw: unknown, now = Date.now()) {
  const row = input(raw, uid, ['postId', 'cursor']);
  if (!validAudienceId(row.postId) || (row.cursor !== undefined && (typeof row.cursor !== 'string' || !/^[a-f0-9]{48}$/.test(row.cursor)))) throw new HttpsError('invalid-argument', 'Invalid discussion page.');
  const next = randomBytes(24).toString('hex');
  return db.runTransaction(async tx => {
    const viewer = await viewerIdentity(db, tx, uid, row);
    if (!await admitSocialPost(db, tx, viewer, row.postId as string)) throw unavailable();
    let query = db.collection('comments').where('post_id', '==', row.postId).orderBy('created_at', 'asc').orderBy(FieldPath.documentId(), 'asc').limit(PAGE + 1);
    if (row.cursor) {
      const cursor = (await tx.get(db.collection('_comment_cursors').doc(row.cursor as string))).data();
      if (!cursor || cursor.version !== 1 || cursor.owner_uid !== uid || cursor.profile_id !== viewer.profileId || cursor.post_id !== row.postId
        || !(cursor.expires_at instanceof Timestamp) || cursor.expires_at.toMillis() <= now || typeof cursor.comment_id !== 'string' || !cursor.comment_id || cursor.comment_id.includes('/') || Buffer.byteLength(cursor.comment_id) > 1500 || !Object.hasOwn(cursor, 'created_at')) throw new HttpsError('failed-precondition', 'This discussion page expired. Refresh comments.');
      query = query.startAfter(cursor.created_at, cursor.comment_id);
    }
    const result = await tx.get(query), candidates = result.docs.slice(0, PAGE), comments = [];
    const proofs = candidates.length ? await tx.getAll(...candidates.map(doc => db.collection('_comment_authority').doc(doc.id))) : [];
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index], projected = await projectComment(db, tx, viewer, candidate.id, candidate.data(), proofs[index].data());
      if (projected) comments.push(projected);
    }
    const more = result.size > PAGE, last = candidates.at(-1);
    if (more && last) tx.create(db.collection('_comment_cursors').doc(next), { version: 1, owner_uid: uid, profile_id: viewer.profileId,
      post_id: row.postId, comment_id: last.id, created_at: last.data().created_at, expires_at: Timestamp.fromMillis(now + CURSOR_TTL) });
    return { ok: true, ownerUid: uid, profileId: viewer.profileId, postId: row.postId, comments, nextCursor: more ? next : null };
  });
}
/** Counts disclose no comment text or author. Every parent is independently
 * admitted, including analytics requests and historical weekly date filters. */
export async function readPostCommentCountsPage(db: Firestore, uid: string, raw: unknown) {
  const row = input(raw, uid, ['postIds', 'since']);
  if (!Array.isArray(row.postIds) || !row.postIds.length || row.postIds.length > PAGE || row.postIds.some(id => !validAudienceId(id))
    || new Set(row.postIds).size !== row.postIds.length || (row.since !== undefined && (!isoDate(row.since) || isoDate(row.since) !== row.since))) throw new HttpsError('invalid-argument', 'Invalid comment counts request.');
  return db.runTransaction(async tx => {
    const viewer = await viewerIdentity(db, tx, uid, row), counts = [];
    for (const postId of row.postIds as string[]) {
      if (!await admitSocialPost(db, tx, viewer, postId)) continue;
      let query = db.collection('comments').where('post_id', '==', postId);
      if (row.since) query = query.where('created_at', '>=', row.since);
      counts.push({ postId, count: (await tx.get(query.count())).data().count });
    }
    return { ok: true, ownerUid: uid, profileId: viewer.profileId, requestedPostIds: row.postIds, since: row.since ?? null, counts };
  });
}
export async function readCommentContextPage(db: Firestore, uid: string, raw: unknown) {
  const row = input(raw, uid, ['commentId']);
  if (!validAudienceId(row.commentId)) throw new HttpsError('invalid-argument', 'Invalid comment.');
  return db.runTransaction(async tx => {
    const viewer = await viewerIdentity(db, tx, uid, row), source = (await tx.get(db.collection('comments').doc(row.commentId as string))).data();
    let postId: string | null = null;
    if (source && validAudienceId(source.post_id) && await admitSocialPost(db, tx, viewer, source.post_id)) {
      const proof = (await tx.get(db.collection('_comment_authority').doc(row.commentId as string))).data();
      if (await projectComment(db, tx, viewer, row.commentId as string, source, proof)) postId = source.post_id;
    }
    return { ok: true, ownerUid: uid, profileId: viewer.profileId, commentId: row.commentId, postId };
  });
}
type Change = AudienceRow & Binding & { action: 'create' | 'edit' | 'delete' | 'like'; postId: string; requestId: string; commentId: string };
function normalizeChange(raw: unknown, uid: string): Change {
  const row = input(raw, uid, ['action', 'postId', 'requestId', 'commentId', 'expectedRevision', 'text', 'imageUrl', 'liked', 'isFlagged', 'safetyScore', 'safetyCategories']);
  if (!['create', 'edit', 'delete', 'like'].includes(row.action as string) || !validAudienceId(row.postId)
    || typeof row.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.requestId)
    || (row.action !== 'create' && !validAudienceId(row.commentId)) || (row.action === 'create' && row.commentId !== undefined)) throw new HttpsError('invalid-argument', 'Invalid comment change.');
  if (['edit', 'delete'].includes(row.action as string) && row.expectedRevision !== null && (typeof row.expectedRevision !== 'string' || !/^[a-f0-9]{48}$/.test(row.expectedRevision))) throw new HttpsError('invalid-argument', 'Refresh comments before changing this comment.');
  if (row.action === 'create' || row.action === 'edit') {
    if (typeof row.text !== 'string' || row.text.length > 4000 || row.text !== row.text.trim() || [...row.text].some(c => c.charCodeAt(0) < 32 && !['\n', '\t'].includes(c))
      || (row.action === 'create' && !row.text && !row.imageUrl)
      || (row.imageUrl != null && !httpsUrl(row.imageUrl))) throw new HttpsError('invalid-argument', 'Use up to 4,000 characters or a valid image.');
  }
  if (row.action === 'like' && typeof row.liked !== 'boolean') throw new HttpsError('invalid-argument', 'Choose a like state.');
  if ((row.isFlagged !== undefined && typeof row.isFlagged !== 'boolean') || (row.safetyScore !== undefined && (typeof row.safetyScore !== 'number' || !Number.isFinite(row.safetyScore) || row.safetyScore < 0 || row.safetyScore > 1))
    || (row.safetyCategories !== undefined && (!Array.isArray(row.safetyCategories) || row.safetyCategories.length > 20 || row.safetyCategories.some(x => typeof x !== 'string' || x.length > 80)))) throw new HttpsError('invalid-argument', 'Invalid comment safety details.');
  const allowed = row.action === 'create' ? ['text', 'imageUrl', 'isFlagged', 'safetyScore', 'safetyCategories'] : row.action === 'edit' ? ['commentId', 'expectedRevision', 'text'] : row.action === 'delete' ? ['commentId', 'expectedRevision'] : ['commentId', 'liked'];
  if (Object.keys(row).some(key => !['expectedOwnerUid', 'expectedProfileId', 'action', 'postId', 'requestId', ...allowed].includes(key))) throw new HttpsError('invalid-argument', 'Invalid comment change fields.');
  return { ...row, commentId: row.action === 'create' ? `comment_${hash([uid, row.requestId])}` : row.commentId } as Change;
}
export async function runManagePostComment(db: Firestore, uid: string, raw: unknown, now = Date.now()) {
  const row = normalizeChange(raw, uid), digest = hash(Object.entries(raw as AudienceRow).sort(([a], [b]) => a.localeCompare(b))), revision = randomBytes(24).toString('hex');
  return db.runTransaction(async tx => {
    const viewer = await viewerIdentity(db, tx, uid, row);
    if (!await admitSocialPost(db, tx, viewer, row.postId)) throw unavailable();
    const ref = db.collection('comments').doc(row.commentId), stateRef = db.collection('_comment_authority').doc(row.commentId), receiptRef = db.collection('_comment_receipts').doc(hash([uid, row.requestId]));
    const [snapshot, state, prior] = await tx.getAll(ref, stateRef, receiptRef);
    if (prior.exists) {
      if (prior.data()?.fingerprint !== digest || prior.data()?.owner_uid !== uid || prior.data()?.profile_id !== viewer.profileId) throw new HttpsError('already-exists', 'This retry belongs to a different comment change.');
      // Return the recorded acknowledgement without restoring a deleted or
      // subsequently edited comment. Parent permission was freshly checked.
      return prior.data()!.receipt;
    }
    const original = snapshot.data(), proof = state.data();
    let owner = original ? await commentOwner(db, tx, original) : null;
    if (row.action === 'create' ? snapshot.exists || state.exists : !original || original.post_id !== row.postId || !owner || !activeRow(original) || proof?.status === 'deleted') throw unavailable();
    if (row.action !== 'create' && await blocked(db, tx, viewer, owner!)) throw unavailable();
    if (row.action !== 'create' && row.action !== 'like' && owner!.uid !== uid) throw unavailable();
    if (proof && (proof.owner_uid !== owner?.uid || proof.profile_id !== owner?.profileId || proof.post_id !== row.postId)) throw unavailable();
    if (row.action === 'edit' && !row.text && !httpsUrl(original?.image_url)) throw new HttpsError('invalid-argument', 'Enter a comment before saving.');
    const trusted = original && owner ? proven(original, proof, owner, row.commentId) : false;
    if (row.action === 'like' && !trusted) throw unavailable();
    if (['edit', 'delete'].includes(row.action) && row.expectedRevision !== (trusted ? proof!.revision : null)) throw new HttpsError('aborted', 'This comment changed. Refresh it before trying again.');
    let likes: FirebaseFirestore.QuerySnapshot | undefined;
    if (row.action === 'like') likes = await tx.get(db.collection('comment_likes').where('comment_id', '==', row.commentId).where('user_id', 'in', viewer.aliases).limit(101));
    if (likes && likes.size > 100) throw new HttpsError('resource-exhausted', 'This reaction needs repair. Please try later.');
    const receipt = { ok: true, ownerUid: uid, profileId: viewer.profileId, action: row.action, postId: row.postId, commentId: row.commentId,
      requestId: row.requestId, revision: row.action === 'like' ? proof!.revision : revision, ...(row.action === 'like' ? { liked: row.liked } : {}) };
    if (row.action === 'like') {
      for (const like of likes!.docs) tx.delete(like.ref);
      if (row.liked) tx.set(db.collection('comment_likes').doc(hash([row.commentId, uid])), { user_id: viewer.profileId, comment_id: row.commentId, created_at: new Date(now).toISOString() });
    } else {
      owner = viewer;
      const next = row.action === 'create' ? { user_id: viewer.profileId, post_id: row.postId, text: row.text, image_url: row.imageUrl ?? null,
        created_at: new Date(now).toISOString(), is_flagged: row.isFlagged === true, safety_score: row.safetyScore ?? 0, safety_categories: row.safetyCategories ?? [] }
        : { ...original, user_id: viewer.profileId, ...(original?.author_id === undefined ? {} : { author_id: viewer.profileId }), text: row.action === 'edit' ? row.text : original!.text };
      if (row.action === 'delete') tx.delete(ref); else tx.set(ref, next);
      tx.set(stateRef, { version: 1, comment_id: row.commentId, owner_uid: uid, profile_id: owner.profileId, post_id: row.postId,
        status: row.action === 'delete' ? 'deleted' : 'active', revision, source_fingerprint: row.action === 'delete' ? null : sourceFingerprint(next) });
    }
    tx.create(receiptRef, { owner_uid: uid, profile_id: viewer.profileId, fingerprint: digest, receipt, created_at: Timestamp.fromMillis(now) });
    return receipt;
  });
}
