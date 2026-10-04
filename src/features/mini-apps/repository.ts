import { collection, doc, documentId, orderBy, startAfter, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';
import { validateMiniApp, type MiniAppRecord, type MiniAppSource } from './model';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { miniAppAccountGuard } from './account';

export const MINI_APP_PAGE_SIZE = 24;
export type MiniAppPage = { apps: MiniAppRecord[]; nextCursor: string | null };
export async function listMiniAppsPage(ownerId: string, view: 'published' | 'drafts', cursor?: string): Promise<MiniAppPage> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (!['published', 'drafts'].includes(view) || (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 1500 || cursor.includes('/')))) throw new Error('Refresh the mini-app library to continue.');
  const privateView = view === 'drafts';
  const reference = collection(getFirestoreDb(), privateView ? 'mini_app_drafts' : 'mini_apps');
  const rows = await getDocs(query(reference, where(privateView ? 'owner_id' : 'status', '==', privateView ? ownerId : 'published'),
    orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(MINI_APP_PAGE_SIZE + 1)));
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
  const row = await getDoc(doc(getFirestoreDb(), 'mini_apps', id));
  if (!row.exists() || row.data().status !== 'published') return null;
  return { ...row.data(), id: row.id } as MiniAppRecord;
}

export async function saveMiniAppDraft(ownerId: string, source: MiniAppSource, existing?: MiniAppRecord | null, pendingId?: string): Promise<MiniAppRecord> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (existing && existing.owner_id !== ownerId) throw new Error('You can only edit your own mini apps.');
  const content = validateMiniApp(source);
  if (pendingId && !/^[\w-]{1,128}$/.test(pendingId)) throw new Error('Invalid draft identity. Reopen the studio.');
  const reference = existing || pendingId ? doc(getFirestoreDb(), 'mini_app_drafts', existing?.id || pendingId!) : doc(collection(getFirestoreDb(), 'mini_app_drafts'));
  const conflict = () => Object.assign(new Error('This draft changed in another tab or device. Your code is still here. Save it as a new draft, or reopen the latest saved version.'), { code: 'mini-app-conflict' });
  const sameSource = (row: unknown, other: unknown) => JSON.stringify(validateMiniApp(row)) === JSON.stringify(validateMiniApp(other));
  return runTransaction(getFirestoreDb(), async transaction => {
    guard();
    const snapshot = await transaction.get(reference);
    guard();
    const remote = snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as MiniAppRecord : null;
    if (remote && remote.owner_id !== ownerId) throw new Error('You can only edit your own mini apps.');
    // An acknowledged-equivalent retry is safe even when the previous response
    // was lost. Different content must never overwrite a recovered identity.
    if (remote && sameSource(remote, content)) return remote;
    if (remote ? !existing || !sameSource(remote, existing) : !!existing) throw conflict();
    const data = { ...content, owner_id: ownerId, schema_version: 1 as const, updated_at: serverTimestamp(),
      created_at: remote?.created_at || serverTimestamp() };
    transaction.set(reference, data);
    return { ...data, id: reference.id };
  }).then(record => { guard(); return record; });
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
    const published = await getDoc(doc(getFirestoreDb(), 'mini_apps', draft.id));
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
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code || 'unknown' });
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
