import { runTransaction } from 'firebase/firestore';
import { documentRef, getDocumentsFromServer, getFirestoreDb, newDocumentId, where } from '@/lib/firebase/firestoreDb';
import { db } from '@/lib/firebase';

export interface BackgroundAccount { authUid: string; profileId: string }
export interface UserBackground {
  id: string; user_id: string; image_url: string; name: string | null;
  storage_path: string | null; is_active: boolean; created_at: string; updated_at: string;
}
export type AddBackgroundInput = { imageUrl: string; name?: string; storagePath?: string; setActive?: boolean };
export type BackgroundChange =
  | { kind: 'add'; input: AddBackgroundInput }
  | { kind: 'activate'; id: string } | { kind: 'clear' }
  | { kind: 'rename'; id: string; name: string } | { kind: 'delete'; id: string };
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 1500 && !id.includes('/');
const ownerIds = (account: BackgroundAccount) => [...new Set([account.profileId, account.authUid])];
const owns = (row: UserBackground, account: BackgroundAccount) => ownerIds(account).includes(row.user_id);

export async function loadUserBackgrounds(account: BackgroundAccount, signal?: AbortSignal): Promise<UserBackground[]> {
  const rows = await Promise.all(ownerIds(account).map(id => getDocumentsFromServer<UserBackground>(
    'user_backgrounds', [where('user_id', '==', id)],
  )));
  if (signal?.aborted) throw new DOMException('Background request cancelled', 'AbortError');
  return [...new Map(rows.flat().filter(row => owns(row, account) && validId(row.id) && typeof row.image_url === 'string')
    .map(row => [row.id, row])).values()]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

/** A private pointer serializes activations; is_active remains the profile-cover read model. */
export async function changeUserBackground(account: BackgroundAccount, change: BackgroundChange, assertCurrent: () => Promise<void>) {
  await assertCurrent();
  if (!validId(account.authUid) || !validId(account.profileId)) throw new Error('Please sign in again');
  const affectsActive = change.kind !== 'rename' && !(change.kind === 'add' && change.input.setActive === false);
  const existing = affectsActive ? (await loadUserBackgrounds(account)).filter(row => row.is_active) : [];
  if (existing.length > 400) throw new Error('Too many active backgrounds. Please contact support.');
  await assertCurrent();
  const id = change.kind === 'add' ? newDocumentId('user_backgrounds') : 'id' in change ? change.id : null;
  if (id !== null && !validId(id)) throw new Error('Invalid background');
  if (change.kind === 'add' && (!change.input.imageUrl || !/^(https:\/\/|gs:\/\/)/.test(change.input.imageUrl))) throw new Error('A valid background image is required');
  if (change.kind === 'rename' && !change.name.trim()) throw new Error('Enter a background name');
  const pointer = documentRef(`profiles/${account.authUid}/settings`, 'background');
  const result = await runTransaction(getFirestoreDb(), async tx => {
    await assertCurrent();
    const pointerSnapshot = affectsActive ? await tx.get(pointer) : null;
    const pointerId = pointerSnapshot?.data()?.active_background_id;
    const ids = new Set(existing.map(row => row.id));
    if (validId(pointerId)) ids.add(pointerId);
    if (id && change.kind !== 'add') ids.add(id);
    const snapshots = await Promise.all([...ids].map(rowId => tx.get(documentRef('user_backgrounds', rowId))));
    const rows = snapshots.filter(snap => snap.exists()).map(snap => ({ ...snap.data(), id: snap.id }) as UserBackground);
    if (rows.some(row => !owns(row, account))) throw new Error('Background ownership could not be verified');
    const target = rows.find(row => row.id === id);
    if (change.kind !== 'add' && change.kind !== 'clear' && !target) throw new Error('This background is no longer available');
    await assertCurrent();
    const now = new Date().toISOString();
    let selectedId = validId(pointerId) && rows.some(row => row.id === pointerId && row.is_active) ? pointerId : rows.find(row => row.is_active)?.id ?? null;
    let saved: UserBackground | null = target ?? null;
    let wasActive = false;
    if (change.kind === 'activate' || (change.kind === 'add' && change.input.setActive !== false)) selectedId = id;
    if (change.kind === 'clear') selectedId = null;
    if (change.kind === 'delete') { wasActive = target!.is_active; if (selectedId === id) selectedId = null; }
    if (affectsActive) {
      for (const row of rows) {
        if (change.kind === 'delete' && row.id === id) continue;
        if (row.is_active !== (row.id === selectedId)) tx.update(documentRef('user_backgrounds', row.id), { is_active: row.id === selectedId, updated_at: now });
      }
      tx.set(pointer, { active_background_id: selectedId, updated_at: now });
    }
    if (change.kind === 'add') {
      saved = { id: id!, user_id: account.profileId, image_url: change.input.imageUrl, name: change.input.name?.trim() || 'Background', storage_path: change.input.storagePath ?? null, is_active: change.input.setActive !== false, created_at: now, updated_at: now };
      tx.set(documentRef('user_backgrounds', id!), saved);
    } else if (change.kind === 'rename') {
      tx.update(documentRef('user_backgrounds', id!), { name: change.name.trim(), updated_at: now });
    } else if (change.kind === 'delete') { tx.delete(documentRef('user_backgrounds', id!)); }
    return { background: saved, wasActive, cleanupFailed: false };
  });
  await assertCurrent();
  // Commit metadata first; a failed write must not remove an image still in use.
  // Read the path from the owned row, never from the deletion request.
  const path = result.background?.storage_path;
  if (change.kind === 'delete' && path?.startsWith(`${account.authUid}/backgrounds/`) && !path.split('/').includes('..')) {
    try {
      const { error } = await db.storage.from('media').remove([path]);
      result.cleanupFailed = Boolean(error);
    } catch { result.cleanupFailed = true; }
  }
  await assertCurrent();
  return result;
}
