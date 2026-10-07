import { createHash } from 'node:crypto';
import { FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { MINI_APP_DRAFT_LIMIT } from './miniAppDrafts.js';
import { miniAppSource } from './miniAppPublish.js';

/** Matches the client page size in src/features/mini-apps/repository.ts. */
export const MINI_APP_LIST_PAGE_SIZE = 24;

type ListedView = 'published' | 'drafts';
type ListedApp = {
  id: string;
  owner_id: string;
  schema_version: 1;
  title: string;
  description: string;
  category: string;
  html: string;
  css: string;
  javascript: string;
  status?: 'published';
  publication_revision?: string;
  created_at?: { seconds: number; nanoseconds: number };
  updated_at?: { seconds: number; nanoseconds: number };
};

function stamp(value: unknown): { seconds: number; nanoseconds: number } | undefined {
  if (!(value instanceof Timestamp)) return undefined;
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}

function admit(id: string, data: FirebaseFirestore.DocumentData | undefined, view: ListedView, uid: string): ListedApp | null {
  if (!data || !/^[\w-]{1,128}$/.test(id) || data.schema_version !== 1 || typeof data.owner_id !== 'string' || !/^[\w-]{1,128}$/.test(data.owner_id)) return null;
  if (view === 'drafts' ? data.owner_id !== uid : data.status !== 'published') return null;
  let source;
  try { source = miniAppSource(data); } catch { return null; }
  const revision = typeof data.publication_revision === 'string' && /^[a-f0-9]{32}$/.test(data.publication_revision) ? data.publication_revision : undefined;
  const created = stamp(data.created_at);
  const updated = stamp(data.updated_at);
  return {
    id, owner_id: data.owner_id, schema_version: 1, ...source,
    ...(view === 'published' ? { status: 'published' as const, ...(revision ? { publication_revision: revision } : {}) } : {}),
    ...(created ? { created_at: created } : {}),
    ...(updated ? { updated_at: updated } : {}),
  };
}

function pageOf(docs: FirebaseFirestore.QueryDocumentSnapshot[], view: ListedView, uid: string) {
  const candidates = docs.slice(0, MINI_APP_LIST_PAGE_SIZE);
  const apps: ListedApp[] = [];
  for (const row of candidates) {
    const app = admit(row.id, row.data(), view, uid);
    if (app) apps.push(app);
  }
  const last = candidates.at(-1);
  return { apps, nextCursor: docs.length > MINI_APP_LIST_PAGE_SIZE && last ? last.id : null };
}

/**
 * Signed-in library read. Client Firestore queries are denied by the deployed
 * rules, so this uses the admin SDK and applies the same boundary: published
 * snapshots for any signed-in member, drafts only for their owner.
 */
export async function runListMiniApps(database: Firestore, uid: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpsError('invalid-argument', 'Refresh the mini-app library to continue.');
  const request = input as Record<string, unknown>;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || request.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Sign in again before opening mini apps.');
  if (Object.keys(request).some(key => !['expectedOwnerUid', 'view', 'cursor', 'appId'].includes(key))) throw new HttpsError('invalid-argument', 'Refresh the mini-app library to continue.');
  if (request.view !== 'published' && request.view !== 'drafts') throw new HttpsError('invalid-argument', 'Refresh the mini-app library to continue.');
  const view = request.view;
  const cursor = request.cursor === undefined || request.cursor === null ? undefined : request.cursor;
  if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 1500 || cursor.includes('/'))) throw new HttpsError('invalid-argument', 'Refresh the mini-app library to continue.');
  const appId = request.appId === undefined ? undefined : request.appId;
  if (appId !== undefined && (typeof appId !== 'string' || !/^[\w-]{1,128}$/.test(appId) || view !== 'published' || cursor !== undefined)) {
    throw new HttpsError('invalid-argument', 'Open the mini app again.');
  }
  if (appId) {
    const row = await database.doc(`mini_apps/${appId}`).get();
    const app = row.exists ? admit(row.id, row.data(), 'published', uid) : null;
    return { apps: app ? [app] : [], nextCursor: null };
  }
  if (view === 'drafts') {
    // owner_id alone uses the automatic single-field index. Ordering by
    // document id as well would require a composite index that is not deployed.
    const owned = await database.collection('mini_app_drafts').where('owner_id', '==', uid).limit(MINI_APP_DRAFT_LIMIT).get();
    const sorted = [...owned.docs].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const start = cursor ? sorted.findIndex(row => row.id > cursor) : 0;
    return pageOf(start < 0 ? [] : sorted.slice(start, start + MINI_APP_LIST_PAGE_SIZE + 1), 'drafts', uid);
  }
  let query = database.collection('mini_apps').orderBy(FieldPath.documentId());
  if (cursor) query = query.startAfter(cursor);
  const page = await query.limit(MINI_APP_LIST_PAGE_SIZE + 1).get();
  return pageOf(page.docs, 'published', uid);
}

export const listMiniApps = onCall({ region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 }, async request => {
  const uid = requireAuth(request);
  if (request.data?.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Sign in again before opening mini apps.');
  enforceRateLimit(await rateLimit(`mini-app-list:${createHash('sha256').update(uid).digest('hex')}`, 120, 60));
  return runListMiniApps(db, uid, request.data);
});
