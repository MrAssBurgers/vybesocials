import { collection, deleteDoc, doc, documentId, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';
import { validateMiniApp, type MiniAppRecord, type MiniAppSource } from './model';
import { miniAppAccountGuard } from './account';

export async function listMiniApps(ownerId?: string): Promise<MiniAppRecord[]> {
  const guard = ownerId ? miniAppAccountGuard(ownerId) : () => {};
  guard();
  const reference = collection(getFirestoreDb(), ownerId ? 'mini_app_drafts' : 'mini_apps');
  const rows = await getDocs(query(reference, where(ownerId ? 'owner_id' : 'status', '==', ownerId || 'published'), limit(60)));
  guard();
  return rows.docs.map(row => ({ ...row.data(), id: row.id } as MiniAppRecord));
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
  let saved = existing;
  if (!saved && pendingId) {
    // An exact document-ID query evaluates the missing document's read rule.
    // Use a bounded owner-filtered range so a new identity safely returns empty
    // (or the next owned draft); only an exact returned ID may be recovered.
    const matches = await getDocs(query(collection(getFirestoreDb(), 'mini_app_drafts'), where('owner_id', '==', ownerId), where(documentId(), '>=', pendingId), limit(1)));
    guard();
    const recovered = matches.docs.find(row => row.id === pendingId);
    if (recovered) saved = { ...recovered.data(), id: recovered.id } as MiniAppRecord;
  }
  const data = { ...content, owner_id: ownerId, schema_version: 1 as const, updated_at: serverTimestamp() };
  const createdAt = saved?.created_at || serverTimestamp();
  if (saved) await updateDoc(reference, data);
  else await setDoc(reference, { ...data, created_at: createdAt });
  guard();
  // A confirmed write is sufficient. Publishing creates its own server time;
  // a failing read-back must not turn a durable save into a duplicate retry.
  return { ...data, created_at: createdAt, id: reference.id };
}

export async function publishMiniApp(ownerId: string, draft: MiniAppRecord): Promise<void> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (draft.owner_id !== ownerId || !draft.created_at) throw new Error('Save your own draft before publishing.');
  const reference = doc(getFirestoreDb(), 'mini_apps', draft.id);
  const published = await getDoc(reference);
  guard();
  // Only the validated source is copied. Future draft writes cannot alter it.
  await setDoc(reference, {
    ...validateMiniApp(draft), owner_id: ownerId, schema_version: 1,
    status: 'published', created_at: published.exists() ? published.data().created_at : serverTimestamp(), updated_at: serverTimestamp(),
  });
  guard();
}

export async function unpublishMiniApp(ownerId: string, app: MiniAppRecord): Promise<void> {
  const guard = miniAppAccountGuard(ownerId); guard();
  if (app.owner_id !== ownerId) throw new Error('You can only unpublish your own apps.');
  await deleteDoc(doc(getFirestoreDb(), 'mini_apps', app.id));
  guard();
}
