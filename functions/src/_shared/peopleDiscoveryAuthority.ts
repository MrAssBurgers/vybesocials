import type { Auth } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId, normalizedProfileSettings, type AudienceIdentity } from './profileAudienceAuthority.js';

type Row = Record<string, unknown>;
type Actor = AudienceIdentity & { created: number; binding: string };
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const stamp = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const changed = () => new HttpsError('failed-precondition', 'Your account changed. Reopen suggestions.');

export function discoveryAge(value: unknown, now: number): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birth = new Date(value + 'T00:00:00Z'), today = new Date(now);
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== value || birth.getTime() > now) return null;
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age--;
  return age >= 0 && age <= 120 ? age : null;
}

async function currentAuth(auth: Pick<Auth, 'getUser'>, actor: Actor) {
  try {
    const user = await auth.getUser(actor.uid);
    return !user.disabled && user.uid === actor.uid && Date.parse(user.metadata.creationTime) === actor.created;
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/user-not-found') return false;
    throw new HttpsError('unavailable', 'Account verification is unavailable. Please retry.');
  }
}

async function bound(db: Firestore, tx: Transaction, alias: string): Promise<Actor | null> {
  // Reject missing/retired protected bindings before the six-query identity
  // check. This is only a negative prefilter: admitted rows still pass the
  // complete alias, uniqueness, index and ownership verification below.
  const direct = await tx.get(db.doc(`profiles/${alias}`));
  const possibleUid = direct.exists ? direct.data()?.user_id : alias;
  if (!validAudienceId(possibleUid)) return null;
  const b = (await tx.get(db.doc(`_account_profile_bindings/${possibleUid}`))).data();
  if (b?.version !== 1 || b.status !== 'active' || b.owner_uid !== possibleUid
    || !stamp(b.auth_created_at_ms) || typeof b.revision !== 'string' || !/^[a-f0-9]{48}$/.test(b.revision)) return null;
  const who = await resolveIdentity(db, tx, alias);
  if (!who || who.uid !== possibleUid || b.profile_id !== who.profileId) return null;
  return { ...who, created: b.auth_created_at_ms, binding: b.revision };
}

async function ageOf(db: Firestore, tx: Transaction, actor: Actor, now: number) {
  const privateRow = (await tx.get(db.doc(`profile_private/${actor.profileId}`))).data();
  if (privateRow && ((privateRow.id !== undefined && privateRow.id !== actor.profileId)
    || (privateRow.profile_id !== undefined && privateRow.profile_id !== actor.profileId)
    || (privateRow.user_id != null && privateRow.user_id !== actor.uid))) return null;
  // Legacy birthdays can be used internally, never copied into a response.
  return discoveryAge(privateRow?.date_of_birth ?? actor.row.date_of_birth, now);
}

/** Bounded, read-only suggestions. No request creates identity or consent. */
export async function peopleDiscovery(db: Firestore, auth: Pick<Auth, 'getUser'>, uid: string, raw: unknown, clock = Date.now) {
  if (!object(raw) || raw.expectedOwnerUid !== uid) throw changed();
  if (!validAudienceId(raw.expectedProfileId) || !stamp(raw.expectedAccountCreatedAt)
    || Object.keys(raw).some(k => !['expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt', 'limit', 'candidateIds'].includes(k))
    || (raw.limit !== undefined && (!Number.isSafeInteger(raw.limit) || Number(raw.limit) < 1 || Number(raw.limit) > 120))
    || (raw.candidateIds !== undefined && (!Array.isArray(raw.candidateIds) || raw.candidateIds.length > 120 || !raw.candidateIds.every(validAudienceId)))) {
    throw new HttpsError('invalid-argument', 'A valid suggestion selection is required.');
  }
  const limit = Number(raw.limit ?? 120), selected = raw.candidateIds as string[] | undefined;
  return db.runTransaction(async tx => {
    const now = clock();
    const actor = await bound(db, tx, uid);
    if (!actor || actor.uid !== uid || actor.profileId !== raw.expectedProfileId || actor.created !== raw.expectedAccountCreatedAt || !await currentAuth(auth, actor)) throw changed();
    if (actor.row.is_banned === true || actor.row.deletion_requested_at || actor.row.scheduled_purge_at) throw new HttpsError('permission-denied', 'This account is not available for suggestions.');
    const age = await ageOf(db, tx, actor, now);
    const receipt = async (ageReviewRequired: boolean, profiles: Row[]) => {
      if (!await currentAuth(auth, actor)) throw changed();
      const serverTime = clock();
      return { ok: true as const, ownerUid: uid, profileId: actor.profileId, accountCreatedAt: actor.created,
        serverTime, leaseUntil: serverTime + 15_000, ageReviewRequired, profiles };
    };
    if (age === null || age < 13) return receipt(true, []);
    if (selected?.length === 0) return receipt(false, []);
    const window = age < 18 ? { min: Math.max(13, age - 2), max: Math.min(17, age + 2) }
      : age < 25 ? { min: Math.max(18, age - 4), max: age + 4 } : { min: Math.max(18, age - 7), max: age + 7 };
    const edges = async (who: Actor) => {
      const results = await Promise.all(['sender_id', 'receiver_id'].map(field => tx.get(db.collection('friend_requests')
        .where(field, 'in', who.aliases).where('status', '==', 'accepted').limit(50))));
      return [...new Map(results.flatMap(result => result.docs).map(doc => [doc.id, doc.data()])).values()];
    };
    const blocked = async (left: Actor, right: Actor) => {
      const rows = await Promise.all([
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', left.aliases).where('blocked_id', 'in', right.aliases).limit(1)),
        tx.get(db.collection('blocked_users').where('blocker_id', 'in', right.aliases).where('blocked_id', 'in', left.aliases).limit(1)),
      ]);
      return rows.some(row => !row.empty);
    };
    const friendAliases = new Set((await edges(actor)).map(edge => actor.aliases.includes(String(edge.sender_id)) ? edge.receiver_id : edge.sender_id).filter(validAudienceId));
    const mutuals = new Map<string, Set<string>>();
    const intermediaries = new Map<string, Actor>();
    for (const alias of [...friendAliases].slice(0, 20)) {
      const friend = await bound(db, tx, alias);
      if (!friend || friend.uid === uid || friend.row.is_banned === true || friend.row.deletion_requested_at || friend.row.scheduled_purge_at
        || intermediaries.has(friend.uid) || !await currentAuth(auth, friend) || await blocked(actor, friend)) continue;
      intermediaries.set(friend.uid, friend);
      friend.aliases.forEach(value => friendAliases.add(value));
      for (const edge of await edges(friend)) {
        const other = friend.aliases.includes(String(edge.sender_id)) ? edge.receiver_id : edge.sender_id;
        if (!validAudienceId(other) || actor.aliases.includes(other) || friendAliases.has(other)) continue;
        const via = mutuals.get(other) || new Set<string>(); via.add(friend.uid); mutuals.set(other, via);
        if (mutuals.size >= 120) break;
      }
      if (mutuals.size >= 120) break;
    }
    const ids = selected !== undefined ? [...new Set(selected)].slice(0, limit)
      : [...new Set([...mutuals.keys(), ...(await tx.get(db.collection('profiles').orderBy('created_at', 'desc').limit(limit))).docs.map(d => d.id)])].slice(0, limit);
    const profiles: Row[] = [];
    // Eight concurrent candidates keep the read bounded while avoiding thirty
    // serial network batches for a mostly unbound imported profile directory.
    // Results are folded in input order, independent of completion order.
    for (let start = 0; start < ids.length && profiles.length < 30; start += 8) {
      const rows = await Promise.all(ids.slice(start, start + 8).map(async id => {
        const target = await bound(db, tx, id);
        if (!target || (selected !== undefined && target.profileId !== id) || target.uid === uid || target.aliases.some(alias => friendAliases.has(alias)) || target.row.is_private !== false
          || target.row.is_banned === true || target.row.deletion_requested_at || target.row.scheduled_purge_at) return null;
        if (await blocked(actor, target)) return null;
        // Check exact pairs independently of the bounded graph. Large friend
        // lists and mixed UID/profile aliases must not re-suggest an existing
        // friend, a pending recipient or a dismissed profile.
        const excluded = await Promise.all([
          tx.get(db.collection('friend_requests').where('sender_id', 'in', actor.aliases).where('receiver_id', 'in', target.aliases).where('status', 'in', ['accepted', 'pending']).limit(1)),
          tx.get(db.collection('friend_requests').where('sender_id', 'in', target.aliases).where('receiver_id', 'in', actor.aliases).where('status', '==', 'accepted').limit(1)),
          tx.get(db.collection('dismissed_profiles').where('user_id', 'in', actor.aliases).where('dismissed_user_id', 'in', target.aliases).limit(1)),
        ]);
        if (excluded.some(row => !row.empty)) return null;
        const targetAge = await ageOf(db, tx, target, now);
        if (targetAge === null || targetAge < window.min || targetAge > window.max || !await currentAuth(auth, target)) return null;
        const username = target.row.username;
        if (typeof username !== 'string' || !username.trim() || username.length > 100) return null;
        const avatar = target.row.avatar_url;
        const visibility = normalizedProfileSettings((await tx.get(db.doc(`profile_visibility/${target.profileId}`))).data(), target.profileId);
        const via = new Set(target.aliases.flatMap(alias => [...(mutuals.get(alias) || [])]));
        let mutualCount = 0;
        if (['public', 'everyone'].includes(visibility.mutual_friends)) {
          for (const friendUid of via) {
            const friend = intermediaries.get(friendUid);
            if (friend && !await blocked(target, friend)) mutualCount++;
          }
        }
        return { id: target.profileId, username, display_name: typeof target.row.display_name === 'string' ? target.row.display_name.slice(0, 200) : null,
          avatar_url: typeof avatar === 'string' && avatar.length <= 8192 && /^https:\/\//.test(avatar) ? avatar : null,
          interests: Array.isArray(target.row.interests) ? target.row.interests.filter(v => typeof v === 'string' && v.length <= 100).slice(0, 30) : [], mutual_count: mutualCount };
      }));
      for (const row of rows) if (row && profiles.length < 30 && !profiles.some(profile => profile.id === row.id)) profiles.push(row);
    }
    return receipt(false, profiles);
  });
}
