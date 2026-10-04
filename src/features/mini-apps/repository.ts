import { collection, doc, documentId, orderBy, startAfter, getDoc, getDocs, limit, query, runTransaction, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';
import { validateMiniApp, type MiniAppRecord, type MiniAppSource } from './model';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { miniAppAccountGuard } from './account';
import { withTimeout } from '@/lib/withTimeout';

export const MINI_APP_PAGE_SIZE = 24;
export const MINI_APP_READ_TIMEOUT_MS = 15_000;
const readMiniApp = <T>(request: Promise<T>) => withTimeout(request, MINI_APP_READ_TIMEOUT_MS, 'Mini apps are taking too long to load. Check your connection and try again.');
export type MiniAppPage = { apps: MiniAppRecord[]; nextCursor: string | null };
export async function listMiniAppsPage(ownerId: string, view: 'published' | 'drafts', cursor?: string): Promise<MiniAppPage> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (!['published', 'drafts'].includes(view) || (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 1500 || cursor.includes('/')))) throw new Error('Refresh the mini-app library to continue.');
  const privateView = view === 'drafts';
  const reference = collection(getFirestoreDb(), privateView ? 'mini_app_drafts' : 'mini_apps');
  const rows = await readMiniApp(getDocs(query(reference, where(privateView ? 'owner_id' : 'status', '==', privateView ? ownerId : 'published'),
    orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(MINI_APP_PAGE_SIZE + 1))));
  guard();
  const candidates = rows.docs.slice(0, MINI_APP_PAGE_SIZE);
  const apps: MiniAppRecord[] = [];
  for (const row of candidates) {
    const data = row.data();
    if (!/^[\w-]{1,128}$/.test(row.id) || data.schema_version !== 1 || typeof data.owner_id !== 'string'
      || (privateView ? data.owner_id !== ownerId : data.status !== 'published')) continue;
    try { apps.push({ ...validateMiniApp(data), id: row.id, owner_id: data.owner_id, schema_version: 1,
      ...(privateView ? {} : { status: 'published' as const, publication_revision: data.publication_revision }), created_at: data.created_at, updated_at: data.updated_at }); }
    catch { /* A malformed candidate cannot prevent continuation to older apps. */ }
  }
  const last = candidates.at(-1);
  return { apps, nextCursor: rows.docs.length > MINI_APP_PAGE_SIZE && last ? last.id : null };
}

export async function getPublishedMiniApp(id: string): Promise<MiniAppRecord | null> {
  if (!/^[\w-]{1,128}$/.test(id)) return null;
  const row = await readMiniApp(getDoc(doc(getFirestoreDb(), 'mini_apps', id)));
  if (!row.exists() || row.data().status !== 'published') return null;
  return { ...row.data(), id: row.id } as MiniAppRecord;
}

export async function saveMiniAppDraft(ownerId: string, source: MiniAppSource, existing?: MiniAppRecord | null, pendingId?: string): Promise<MiniAppRecord> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (existing && existing.owner_id !== ownerId) throw new Error('You can only edit your own mini apps.');
  const content = validateMiniApp(source);
  if (pendingId && !/^[\w-]{1,128}$/.test(pendingId)) throw new Error('Invalid draft identity. Reopen the studio.');
  const reference = existing || pendingId ? doc(getFirestoreDb(), 'mini_app_drafts', existing?.id || pendingId!) : doc(collection(getFirestoreDb(), 'mini_app_drafts'));
  const result = await invokeFunction<unknown>('saveMiniAppDraft', {
    expectedOwnerUid: ownerId, appId: reference.id, source: content,
    expectedSource: existing ? validateMiniApp(existing) : null,
  });
  guard();
  if (result.error) {
    const code = (result.error.code || result.error.name || 'unknown').replace(/^functions\//, '');
    throw Object.assign(new Error(result.error.message.replace(/\s\[\d{3}\]$/, '')), { code: code === 'aborted' ? 'mini-app-conflict' : code });
  }
  const invalidReceipt = () => new Error('The save response could not be confirmed. Your code is still here. Retry saving to check the saved result.');
  const exactKeys = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
  const timestamp = (value: unknown): value is { seconds: number; nanoseconds: number } => exactKeys(value, ['seconds', 'nanoseconds'])
    && Number.isInteger(value.seconds) && (value.seconds as number) >= -62135596800 && (value.seconds as number) <= 253402300799
    && Number.isInteger(value.nanoseconds) && (value.nanoseconds as number) >= 0 && (value.nanoseconds as number) < 1e9;
  const receipt = result.data;
  if (!exactKeys(receipt, ['appId', 'source', 'createdAt', 'updatedAt']) || receipt.appId !== reference.id
    || !exactKeys(receipt.source, ['title', 'description', 'category', 'html', 'css', 'javascript'])
    || !timestamp(receipt.createdAt) || !timestamp(receipt.updatedAt)) throw invalidReceipt();
  try { if (JSON.stringify(validateMiniApp(receipt.source)) !== JSON.stringify(content)) throw invalidReceipt(); }
  catch { throw invalidReceipt(); }
  if (receipt.createdAt.seconds > receipt.updatedAt.seconds || (receipt.createdAt.seconds === receipt.updatedAt.seconds && receipt.createdAt.nanoseconds > receipt.updatedAt.nanoseconds)) throw invalidReceipt();
  return { ...content, id: reference.id, owner_id: ownerId, schema_version: 1,
    created_at: { ...receipt.createdAt }, updated_at: { ...receipt.updatedAt } };
}

export async function deleteMiniAppDraft(ownerId: string, draft: MiniAppRecord): Promise<void> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (draft.owner_id !== ownerId || !/^[\w-]{1,128}$/.test(draft.id)) throw new Error('You can only delete your own drafts.');
  const result = await invokeFunction<unknown>('deleteMiniAppDraft', {
    expectedOwnerUid: ownerId, appId: draft.id, expectedSource: validateMiniApp(draft),
  });
  guard();
  if (result.error) {
    const code = (result.error.code || result.error.name || 'unknown').replace(/^functions\//, '');
    throw Object.assign(new Error(result.error.message), { code: code === 'aborted' ? 'mini-app-draft-conflict' : code });
  }
  const receipt = result.data as Record<string, unknown> | null;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).length !== 2
    || receipt.appId !== draft.id || receipt.deleted !== true) throw new Error('Deletion could not be confirmed. Refresh your library or retry.');
}

export type MiniAppPublishIntent = { requestId: string; expectedVersion?: string | null; sourceKey?: string };
const publicationVersionPattern = /^(?:[a-f0-9]{32}|legacy:-?\d{1,12}:\d{1,9})$/;
export async function publishMiniApp(ownerId: string, draft: MiniAppRecord, intent: MiniAppPublishIntent = { requestId: crypto.randomUUID() }): Promise<void> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (draft.owner_id !== ownerId || !draft.created_at || !/^[\w-]{1,128}$/.test(draft.id)) throw new Error('Save your own draft before publishing.');
  const source = validateMiniApp(draft);
  const sourceKey = JSON.stringify({ ownerId, id: draft.id, source });
  if (intent.sourceKey !== undefined && intent.sourceKey !== sourceKey) throw new Error('Your code changed. Choose Publish to Hub again to publish the new version.');
  intent.sourceKey = sourceKey;
  if (intent.expectedVersion === undefined) {
    const published = await readMiniApp(getDoc(doc(getFirestoreDb(), 'mini_apps', draft.id)));
    guard();
    if (!published.exists()) intent.expectedVersion = null;
    else {
      const row = published.data();
      const version = row.publication_revision ?? (Number.isInteger(row.updated_at?.seconds) && Number.isInteger(row.updated_at?.nanoseconds) ? `legacy:${row.updated_at.seconds}:${row.updated_at.nanoseconds}` : '');
      if (typeof version !== 'string' || !publicationVersionPattern.test(version)) throw new Error('This publication needs review before it can be replaced.');
      intent.expectedVersion = version;
    }
  }
  guard();
  const result = await invokeFunction<unknown>('publishMiniApp', { expectedOwnerUid: ownerId, appId: draft.id, requestId: intent.requestId, expectedVersion: intent.expectedVersion, source });
  guard();
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code || result.error.name || 'unknown' });
  const receipt = result.data as Record<string, unknown> | null;
  if (!receipt || receipt.appId !== draft.id || receipt.status !== 'published' || typeof receipt.publicationRevision !== 'string' || !publicationVersionPattern.test(receipt.publicationRevision)) {
    throw new Error('The publication response could not be confirmed. Retry publishing to check the saved result.');
  }
}

export async function unpublishMiniApp(ownerId: string, app: MiniAppRecord): Promise<void> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (app.owner_id !== ownerId) throw new Error('You can only unpublish your own apps.');
  const conflict = () => Object.assign(new Error('This app changed since you opened it. Refresh the library and review the latest version before unpublishing.'), { code: 'mini-app-publication-conflict' });
  const version = (row: MiniAppRecord) => {
    if (typeof row.publication_revision === 'string' && /^[a-f0-9]{32}$/.test(row.publication_revision)) return row.publication_revision;
    const time = row.updated_at as { seconds?: number; nanoseconds?: number } | undefined;
    if (row.publication_revision === undefined && Number.isInteger(time?.seconds) && Number.isInteger(time?.nanoseconds)) return `legacy:${time!.seconds}:${time!.nanoseconds}`;
    throw conflict();
  };
  if (!/^[\w-]{1,128}$/.test(app.id)) throw conflict();
  const expected = version(app);
  const reference = doc(getFirestoreDb(), 'mini_apps', app.id);
  await runTransaction(getFirestoreDb(), async transaction => {
    guard();
    const snapshot = await transaction.get(reference);
    guard();
    if (!snapshot.exists()) return; // A lost successful response is safe to retry.
    const current = snapshot.data() as MiniAppRecord;
    if (current.owner_id !== ownerId || version(current) !== expected) throw conflict();
    transaction.delete(reference);
  });
  guard();
}
