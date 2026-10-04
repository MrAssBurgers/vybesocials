import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { closeFriendAuthorityId, hasCloseFriendAuthority, resolveIdentity } from './profileAudienceAuthority.js';
type Row = Record<string, unknown>;
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const validProof = (row: Row, id: string, uid: string) => row.version === 1 && row.owner_uid === uid && validId(row.owner_profile_id)
  && validId(row.friend_uid) && validId(row.friend_profile_id) && typeof row.enabled === 'boolean' && id === closeFriendAuthorityId(uid, row.friend_uid);

export async function manageVerifiedCloseFriends(db: Firestore, uid: string, raw: unknown, nowMs = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpsError('invalid-argument', 'Close-friend details are required.');
  const input = raw as Row;
  if (input.expectedOwnerUid !== uid) throw new HttpsError('failed-precondition', 'Your account changed. Reopen close friends.');
  if (!validId(input.expectedProfileId) || !['list', 'add', 'remove'].includes(String(input.action))
    || Object.keys(input).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', 'friendId', 'cursor'].includes(key))
    || (input.action === 'list' ? input.friendId !== undefined || (input.cursor !== undefined && !validId(input.cursor)) : !validId(input.friendId) || input.cursor !== undefined)) throw new HttpsError('invalid-argument', 'Invalid close-friend request.');
  return db.runTransaction(async tx => {
    const owner = await resolveIdentity(db, tx, uid);
    if (!owner || owner.uid !== uid || owner.profileId !== input.expectedProfileId) throw new HttpsError('failed-precondition', 'Your close-friend profile could not be verified. Refresh and retry.');
    const base = { success: true as const, ownerUid: uid, profileId: owner.profileId };
    if (input.action === 'list') {
      const [proofs, legacy] = await Promise.all([
        tx.get(db.collection('_close_friend_authority').where('owner_uid', '==', uid).where('enabled', '==', true).limit(501)),
        tx.get(db.collection('close_friends').where('user_id', 'in', owner.aliases).limit(1)),
      ]);
      if (proofs.size > 500) throw new HttpsError('resource-exhausted', 'This close-friends list is too large to load. Contact support.');
      const friends: Array<{ id: string; friend: { id: string; username: string; avatar_url: string | null; display_name: string | null } }> = [];
      const resolvedFriends = new Map<string, Awaited<ReturnType<typeof resolveIdentity>>>();
      for (let offset = 0; offset < proofs.size; offset += 10) {
        await Promise.all(proofs.docs.slice(offset, offset + 10).map(async proof => {
          const row = proof.data(); if (validProof(row, proof.id, uid)) resolvedFriends.set(proof.id, await resolveIdentity(db, tx, row.friend_uid as string));
        }));
      }
      for (const proof of proofs.docs) {
        const row = proof.data(); if (!validProof(row, proof.id, uid)) continue;
        const friend = resolvedFriends.get(proof.id);
        if (!friend || !hasCloseFriendAuthority(row, owner, friend)) {
          friends.push({ id: proof.id, friend: { id: row.friend_profile_id as string, username: 'Unavailable account', avatar_url: null, display_name: 'Unavailable account' } });
          continue;
        }
        const bounded = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value : null;
        friends.push({ id: proof.id, friend: { id: friend.profileId, username: bounded(friend.row.username, 128) || '', avatar_url: bounded(friend.row.avatar_url, 8192), display_name: bounded(friend.row.display_name, 256) } });
      }
      const relationships = await Promise.all(['sender_id', 'receiver_id'].map(field => tx.get(db.collection('friend_requests').where(field, 'in', owner.aliases).where('status', '==', 'accepted').limit(1001))));
      if (relationships.some(page => page.size > 1000)) throw new HttpsError('resource-exhausted', 'This friend list is too large to load safely. Contact support.');
      const aliases = new Set<string>();
      for (const page of relationships) for (const doc of page.docs) {
        const row = doc.data(); const other = owner.aliases.includes(row.sender_id) ? row.receiver_id : row.sender_id;
        if (validId(other) && !owner.aliases.includes(other) && (!input.cursor || other > String(input.cursor))) aliases.add(other);
      }
      const sorted = [...aliases].sort(); const selected = sorted.slice(0, 20);
      const candidates: Array<{ id: string; username: string; avatar_url: string | null; display_name: string | null }> = [];
      for (const alias of selected) {
        const friend = await resolveIdentity(db, tx, alias); if (!friend || candidates.some(row => row.id === friend.profileId)) continue;
        const blocks = await Promise.all([
          tx.get(db.collection('blocked_users').where('blocker_id', 'in', owner.aliases).where('blocked_id', 'in', friend.aliases).limit(1)),
          tx.get(db.collection('blocked_users').where('blocker_id', 'in', friend.aliases).where('blocked_id', 'in', owner.aliases).limit(1)),
        ]);
        if (blocks.some(page => !page.empty)) continue;
        const bounded = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value : null;
        candidates.push({ id: friend.profileId, username: bounded(friend.row.username, 128) || '', avatar_url: bounded(friend.row.avatar_url, 8192), display_name: bounded(friend.row.display_name, 256) });
      }
      return { ...base, friends, candidates, candidateNextCursor: sorted.length > selected.length ? selected.at(-1)! : null, legacyReview: !legacy.empty };
    }
    if (input.action === 'remove') {
      const matches = await Promise.all(['friend_profile_id', 'friend_uid'].map(field => tx.get(db.collection('_close_friend_authority')
        .where('owner_uid', '==', uid).where(field, '==', input.friendId).limit(2))));
      const proofs = new Map(matches.flatMap(page => page.docs.map(doc => [doc.id, doc] as const)));
      if (proofs.size !== 1) throw new HttpsError('failed-precondition', 'That saved close-friend permission could not be identified. Refresh the list.');
      const proof = [...proofs.values()][0]; const row = proof.data();
      if (!validProof(row, proof.id, uid)) throw new HttpsError('failed-precondition', 'This close-friend permission needs verification. Contact support.');
      // Owners can revoke retained proofs even after the target profile is gone.
      // No current or caller-supplied profile mapping can turn removal into a grant.
      tx.update(proof.ref, { enabled: false, updated_at: new Date(nowMs).toISOString() });
      return { ...base, action: 'remove' as const, friendId: row.friend_profile_id as string };
    }
    const friend = await resolveIdentity(db, tx, input.friendId as string);
    if (!friend || friend.uid === uid) throw new HttpsError('failed-precondition', 'That close-friend account could not be verified.');
    const proofRef = db.collection('_close_friend_authority').doc(closeFriendAuthorityId(uid, friend.uid));
    const proof = await tx.get(proofRef);
    if (proof.exists && (proof.data()?.version !== 1 || proof.data()?.owner_uid !== uid || proof.data()?.friend_uid !== friend.uid)) throw new HttpsError('failed-precondition', 'This close-friend permission needs verification. Contact support.');
    if (input.action === 'add') {
      const [outgoing, incoming, blockedByOwner, blockedByFriend, active] = await Promise.all([
        tx.get(db.collection('friend_requests').where('sender_id', 'in', owner.aliases).where('receiver_id', 'in', friend.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('friend_requests').where('sender_id', 'in', friend.aliases).where('receiver_id', 'in', owner.aliases).where('status', '==', 'accepted').limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', owner.aliases).where('blocked_id', 'in', friend.aliases).limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', friend.aliases).where('blocked_id', 'in', owner.aliases).limit(1)),
        tx.get(db.collection('_close_friend_authority').where('owner_uid', '==', uid).where('enabled', '==', true).limit(500)),
      ]);
      if ((outgoing.empty && incoming.empty) || !blockedByOwner.empty || !blockedByFriend.empty) throw new HttpsError('permission-denied', 'Only current, unblocked friends can be added to close friends.');
      if (active.size >= 500 && proof.data()?.enabled !== true) throw new HttpsError('resource-exhausted', 'Your close-friends list is full. Remove someone before adding another friend.');
    }
    const now = new Date(nowMs).toISOString();
    tx.set(proofRef, { version: 1, owner_uid: uid, owner_profile_id: owner.profileId, friend_uid: friend.uid, friend_profile_id: friend.profileId,
      enabled: input.action === 'add', created_at: proof.data()?.created_at || now, updated_at: now });
    return { ...base, action: input.action as 'add' | 'remove', friendId: friend.profileId };
  });
}
