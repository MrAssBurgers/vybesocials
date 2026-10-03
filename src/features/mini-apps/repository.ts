import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase/firestoreDb';
import { getFirebaseAuth } from '@/lib/firebase/authService';
import { validateMiniApp, type MiniAppRecord, type MiniAppSource } from './model';

function requireOwner(ownerId: string) {
  if (!ownerId || getFirebaseAuth()?.currentUser?.uid !== ownerId) throw new Error('Sign in again to save your mini app.');
}

export async function listMiniApps(ownerId?: string): Promise<MiniAppRecord[]> {
  if (ownerId) requireOwner(ownerId);
  const reference = collection(getFirestoreDb(), ownerId ? 'mini_app_drafts' : 'mini_apps');
  const rows = await getDocs(query(reference, where(ownerId ? 'owner_id' : 'status', '==', ownerId || 'published'), limit(60)));
  return rows.docs.map(row => ({ ...row.data(), id: row.id } as MiniAppRecord));
}

export async function getPublishedMiniApp(id: string): Promise<MiniAppRecord | null> {
  if (!/^[\w-]{1,128}$/.test(id)) return null;
  const row = await getDoc(doc(getFirestoreDb(), 'mini_apps', id));
  if (!row.exists() || row.data().status !== 'published') return null;
  return { ...row.data(), id: row.id } as MiniAppRecord;
}

export async function saveMiniAppDraft(ownerId: string, source: MiniAppSource, existing?: MiniAppRecord | null): Promise<MiniAppRecord> {
  requireOwner(ownerId);
  if (existing && existing.owner_id !== ownerId) throw new Error('You can only edit your own mini apps.');
  const content = validateMiniApp(source);
  const reference = existing ? doc(getFirestoreDb(), 'mini_app_drafts', existing.id) : doc(collection(getFirestoreDb(), 'mini_app_drafts'));
  const data = { ...content, owner_id: ownerId, schema_version: 1 as const, updated_at: serverTimestamp() };
  if (existing) await updateDoc(reference, data);
  else await setDoc(reference, { ...data, created_at: serverTimestamp() });
  // Read back the resolved created_at once so publish can preserve its timestamp.
  const saved = await getDoc(reference);
  if (!saved.exists()) throw new Error('Your draft could not be loaded. Please try again.');
  return { ...saved.data(), id: reference.id } as MiniAppRecord;
}

export async function publishMiniApp(ownerId: string, draft: MiniAppRecord): Promise<void> {
  requireOwner(ownerId);
  if (draft.owner_id !== ownerId || !draft.created_at) throw new Error('Save your own draft before publishing.');
  const reference = doc(getFirestoreDb(), 'mini_apps', draft.id);
  const published = await getDoc(reference);
  // Only the validated source is copied. Future draft writes cannot alter it.
  await setDoc(reference, {
    ...validateMiniApp(draft), owner_id: ownerId, schema_version: 1,
    status: 'published', created_at: published.exists() ? published.data().created_at : serverTimestamp(), updated_at: serverTimestamp(),
  });
}

export async function unpublishMiniApp(ownerId: string, app: MiniAppRecord): Promise<void> {
  requireOwner(ownerId);
  if (app.owner_id !== ownerId) throw new Error('You can only unpublish your own apps.');
  await deleteDoc(doc(getFirestoreDb(), 'mini_apps', app.id));
}
