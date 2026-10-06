import { createHash, randomBytes } from 'node:crypto';
import { FieldPath, Filter, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, requireAuth, enforceRateLimit, rateLimit } from './_shared/admin.js';
import { resolveIdentity, validAudienceId, type AudienceIdentity } from './_shared/profileAudienceAuthority.js';

const day = 86400000;
const pageSize = 20;
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
// Firestore can return object fields in a different order from the write.
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value, (_key, item) =>
  row(item) ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item)).digest('hex');
const revisionId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{48,64}$/.test(value);
function httpsUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function validNoteGif(value: unknown): value is string {
  const url = httpsUrl(value);
  if (!url) return false;
  const host = new URL(url).hostname;
  return host === 'giphy.com' || host.endsWith('.giphy.com');
}
function source(content: unknown, gif: unknown) {
  if (typeof content !== 'string' || content.length > 60 || content !== content.trim() || [...content].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    || (gif !== null && !validNoteGif(gif)) || (!content && !gif)) throw new HttpsError('invalid-argument', 'Use up to 60 characters or choose a GIF.');
  return { content, gif_url: gif };
}
function identityInput(input: unknown, uid: string, keys: string[]) {
  if (!row(input) || !validAudienceId(input.expectedProfileId) || Object.keys(input).some(key => !['expectedOwnerUid', 'expectedProfileId', ...keys].includes(key))) {
    throw new HttpsError('invalid-argument', 'Valid note details are required.');
  }
  if (input.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen notes.');
  return input as Record<string, unknown> & { expectedProfileId: string };
}
async function viewerIdentity(store: Firestore, tx: Transaction, uid: string, profileId: string) {
  const viewer = await resolveIdentity(store, tx, uid);
  if (!viewer || viewer.uid !== uid || viewer.profileId !== profileId) throw new HttpsError('failed-precondition', 'Your profile changed. Reopen notes.');
  return viewer;
}
function projectNote(id: string, data: Record<string, unknown>, uid: string, now: number, profileId: string) {
  if (data.user_id !== uid || (data.status !== undefined && data.status !== 'active') || (data.schema_version !== undefined && data.schema_version !== 1)
    || data.deleted_at || data.is_deleted || data.is_removed || data.removed_at || data.is_hidden
    || (data.moderation_status !== undefined && data.moderation_status !== 'approved') || (data.profile_id !== undefined && data.profile_id !== profileId)) return null;
  try { source(data.content, data.gif_url ?? null); } catch { return null; }
  const created = typeof data.created_at === 'string' ? Date.parse(data.created_at) : NaN;
  const expires = typeof data.expires_at === 'string' ? Date.parse(data.expires_at) : NaN;
  if (!Number.isFinite(created) || !Number.isFinite(expires) || created > now || expires <= now || expires <= created || expires - created > day) return null;
  return { id, user_id: uid, content: data.content as string, gif_url: data.gif_url as string ?? null,
    created_at: new Date(created).toISOString(), expires_at: new Date(expires).toISOString() };
}
async function ownedNote(store: Firestore, tx: Transaction, owner: AudienceIdentity) {
  const [canonical, candidates] = await Promise.all([
    tx.get(store.collection('user_notes').doc(owner.uid)),
    tx.get(store.collection('user_notes').where('user_id', '==', owner.uid).limit(2)),
  ]);
  if (canonical.exists && canonical.data()?.user_id !== owner.uid) throw new HttpsError('failed-precondition', 'Your saved note ownership needs review.');
  if (candidates.size > 1) throw new HttpsError('failed-precondition', 'More than one saved note needs review.');
  return canonical.exists ? canonical : candidates.docs[0] ?? null;
}
function validOwnerState(state: Record<string, unknown>, owner: AudienceIdentity, now: number) {
  return state.owner_uid === owner.uid && state.profile_id === owner.profileId && revisionId(state.revision)
    && typeof state.count === 'number' && Number.isSafeInteger(state.count) && state.count >= 0 && state.count <= 200
    && typeof state.window_started_at === 'number' && Number.isSafeInteger(state.window_started_at) && state.window_started_at >= 0 && state.window_started_at <= now;
}

// Before notes became server-owned, user_id (and every other note field) could
// be forged. A current friendship must never turn that old claim into proof.
// Only an explicit owner save issues this private, content-bound attestation.
function hasPublicationProof(state: Record<string, unknown> | undefined, owner: AudienceIdentity, id: string, data: Record<string, unknown>, now: number) {
  return !!state && validOwnerState(state, owner, now) && id === owner.uid && state.note_id === id
    && state.source_fingerprint === hash([id, state.revision, data]);
}

export async function readFriendsNotes(store: Firestore, uid: string, raw: unknown, now = Date.now()) {
  const input = identityInput(raw, uid, ['cursor']);
  if (input.cursor !== undefined && (typeof input.cursor !== 'string' || !input.cursor || Buffer.byteLength(input.cursor) > 1500 || input.cursor.includes('/'))) throw new HttpsError('invalid-argument', 'Invalid notes page.');
  return store.runTransaction(async tx => {
    const viewer = await viewerIdentity(store, tx, uid, input.expectedProfileId);
    let query = store.collection('friend_requests').where(Filter.and(Filter.where('status', '==', 'accepted'), Filter.or(
      Filter.where('sender_id', 'in', viewer.aliases), Filter.where('receiver_id', 'in', viewer.aliases),
    ))).orderBy(FieldPath.documentId()).limit(pageSize + 1);
    if (input.cursor) query = query.startAfter(input.cursor);
    const snapshot = await tx.get(query);
    const candidates = snapshot.docs.slice(0, pageSize);
    const notes = [];
    const seen = new Set<string>();
    for (const relationship of candidates) {
      const request = relationship.data();
      const alias = viewer.aliases.includes(request.sender_id) ? request.receiver_id : request.sender_id;
      const friend = validAudienceId(alias) ? await resolveIdentity(store, tx, alias) : null;
      if (!friend || friend.uid === uid || seen.has(friend.uid)) continue;
      if (!(viewer.aliases.includes(request.sender_id) && friend.aliases.includes(request.receiver_id))
        && !(friend.aliases.includes(request.sender_id) && viewer.aliases.includes(request.receiver_id))) continue;
      seen.add(friend.uid);
      const [blocking, blocked] = await Promise.all([
        tx.get(store.collection('blocked_users').where('blocker_id', 'in', viewer.aliases).where('blocked_id', 'in', friend.aliases).limit(1)),
        tx.get(store.collection('blocked_users').where('blocker_id', 'in', friend.aliases).where('blocked_id', 'in', viewer.aliases).limit(1)),
      ]);
      if (!blocking.empty || !blocked.empty) continue;
      let saved;
      try { saved = await ownedNote(store, tx, friend); } catch (error) {
        if (error instanceof HttpsError && error.code === 'failed-precondition') continue;
        throw error;
      }
      const state = (await tx.get(store.collection('_user_note_state').doc(friend.uid))).data();
      const note = saved && hasPublicationProof(state, friend, saved.id, saved.data()!, now)
        ? projectNote(saved.id, saved.data()!, friend.uid, now, friend.profileId) : null;
      const username = friend.row.username;
      if (!note || typeof username !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(username)) continue;
      notes.push({ ...note, profile: { id: friend.profileId, username,
        display_name: typeof friend.row.display_name === 'string' && friend.row.display_name.length <= 200 ? friend.row.display_name : null,
        avatar_url: httpsUrl(friend.row.avatar_url) } });
    }
    return { ownerUid: uid, viewerProfileId: viewer.profileId, checkedAt: now, notes,
      nextCursor: snapshot.size > pageSize ? candidates.at(-1)!.id : null };
  });
}

export async function runManageUserNote(store: Firestore, uid: string, raw: unknown, now = Date.now()) {
  const input = identityInput(raw, uid, ['action', 'expectedRevision', 'requestId', 'content', 'gifUrl']);
  if (!['read', 'save', 'delete'].includes(String(input.action))) throw new HttpsError('invalid-argument', 'Choose a note action.');
  const action = input.action as 'read' | 'save' | 'delete';
  if (action === 'read' && Object.keys(input).some(key => !['expectedOwnerUid', 'expectedProfileId', 'action'].includes(key))) throw new HttpsError('invalid-argument', 'Invalid note read.');
  const content = action === 'save' ? source(input.content, input.gifUrl) : null;
  if (action !== 'read' && ((!revisionId(input.expectedRevision) && input.expectedRevision !== null)
    || typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId)
    || (action === 'delete' && (input.content !== undefined || input.gifUrl !== undefined)))) throw new HttpsError('invalid-argument', 'Reopen your note before changing it.');
  return store.runTransaction(async tx => {
    const owner = await viewerIdentity(store, tx, uid, input.expectedProfileId);
    const stateRef = store.collection('_user_note_state').doc(uid);
    const [saved, stateSnap] = await Promise.all([ownedNote(store, tx, owner), tx.get(stateRef)]);
    const state = stateSnap.data();
    if (state && !validOwnerState(state, owner, now)) throw new HttpsError('failed-precondition', 'Your saved note state needs review.');
    const revision = state?.revision ?? (saved ? hash([saved.id, saved.data()]) : null);
    if (action === 'read') {
      const note = saved ? projectNote(saved.id, saved.data()!, uid, now, owner.profileId) : null;
      if (saved && !note && !(typeof saved.data()?.expires_at === 'string' && Date.parse(saved.data()!.expires_at) <= now)) {
        throw new HttpsError('failed-precondition', 'Your saved note cannot be displayed and needs review.');
      }
      return { ownerUid: uid, viewerProfileId: owner.profileId, checkedAt: now, revision, note };
    }
    const receiptRef = store.collection('_user_note_operations').doc(hash([uid, input.requestId]));
    const prior = (await tx.get(receiptRef)).data();
    const fingerprint = hash([owner.profileId, action, input.expectedRevision, content]);
    if (prior) {
      if (prior.fingerprint !== fingerprint || prior.ownerUid !== uid || prior.viewerProfileId !== owner.profileId) throw new HttpsError('already-exists', 'This note request was already used. Reopen your note.');
      return prior.receipt;
    }
    if (revision !== input.expectedRevision) throw new HttpsError('aborted', 'Your note changed in another tab. Reopen it before saving; your text is still here.');
    const window = typeof state?.window_started_at === 'number' && now - state.window_started_at < day ? state.window_started_at : now;
    const count = window === state?.window_started_at && Number.isSafeInteger(state?.count) ? state!.count : 0;
    if (count >= 200) throw new HttpsError('resource-exhausted', 'You have changed your note many times today. Please try again later.');
    const nextRevision = randomBytes(24).toString('hex');
    const noteRef = store.collection('user_notes').doc(uid);
    const nextNote = action === 'save' ? { schema_version: 1, status: 'active', user_id: uid, profile_id: owner.profileId,
      ...content, created_at: new Date(now).toISOString(), expires_at: new Date(now + day).toISOString() } : null;
    if (saved && saved.id !== uid) tx.delete(saved.ref);
    if (!nextNote) tx.delete(noteRef);
    else tx.set(noteRef, nextNote);
    tx.set(stateRef, { owner_uid: uid, profile_id: owner.profileId, revision: nextRevision, window_started_at: window, count: count + 1,
      note_id: nextNote ? uid : null, source_fingerprint: nextNote ? hash([uid, nextRevision, nextNote]) : null });
    const receipt = { success: true, ownerUid: uid, viewerProfileId: owner.profileId, action, requestId: input.requestId, revision: nextRevision };
    tx.create(receiptRef, { ownerUid: uid, viewerProfileId: owner.profileId, fingerprint, receipt });
    return receipt;
  });
}

export const getFriendsNotes = onCall({ timeoutSeconds: 60, invoker: 'public' }, async request => {
  const uid = requireAuth(request); identityInput(request.data, uid, ['cursor']);
  enforceRateLimit(await rateLimit(`notes-read:${hash(uid)}`, 120, 60));
  return readFriendsNotes(db, uid, request.data);
});
export const manageUserNote = onCall({ timeoutSeconds: 60, invoker: 'public' }, async request => {
  const uid = requireAuth(request); identityInput(request.data, uid, ['action', 'expectedRevision', 'requestId', 'content', 'gifUrl']);
  enforceRateLimit(await rateLimit(`notes-own:${hash(uid)}`, 120, 60));
  return runManageUserNote(db, uid, request.data);
});
