import type { Auth } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId, type AudienceIdentity } from './profileAudienceAuthority.js';

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
  const who = await resolveIdentity(db, tx, alias);
  if (!who) return null;
  const b = (await tx.get(db.doc(`_account_profile_bindings/${who.uid}`))).data();
  if (b?.version !== 1 || b.status !== 'active' || b.owner_uid !== who.uid || b.profile_id !== who.profileId
    || !stamp(b.auth_created_at_ms) || typeof b.revision !== 'string' || !/^[a-f0-9]{48}$/.test(b.revision)) return null;
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
    const window = age < 18 ? { min: Math.max(13, age - 2), max: Math.min(17, age + 2) }
      : age < 25 ? { min: Math.max(18, age - 4), max: age + 4 } : { min: Math.max(18, age - 7), max: age + 7 };
    const ids = selected !== undefined ? [...new Set(selected)].slice(0, limit)
      : (await tx.get(db.collection('profiles').orderBy('created_at', 'desc').limit(limit))).docs.map(d => d.id);
    const profiles: Row[] = [];
    // Four concurrent read groups cap fan-out; output order remains deterministic.
    for (let start = 0; start < ids.length && profiles.length < 30; start += 4) {
      const rows = await Promise.all(ids.slice(start, start + 4).map(async id => {
        const target = await bound(db, tx, id);
        if (!target || target.profileId !== id || target.uid === uid || target.row.is_private !== false
          || target.row.is_banned === true || target.row.deletion_requested_at || target.row.scheduled_purge_at) return null;
        const [outgoing, incoming] = await Promise.all([
          tx.get(db.collection('blocked_users').where('blocker_id', 'in', actor.aliases).where('blocked_id', 'in', target.aliases).limit(1)),
          tx.get(db.collection('blocked_users').where('blocker_id', 'in', target.aliases).where('blocked_id', 'in', actor.aliases).limit(1)),
        ]);
        if (!outgoing.empty || !incoming.empty) return null;
        const targetAge = await ageOf(db, tx, target, now);
        if (targetAge === null || targetAge < window.min || targetAge > window.max || !await currentAuth(auth, target)) return null;
        const username = target.row.username;
        if (typeof username !== 'string' || !username.trim() || username.length > 100) return null;
        const avatar = target.row.avatar_url;
        return { id: target.profileId, username, display_name: typeof target.row.display_name === 'string' ? target.row.display_name.slice(0, 200) : null,
          avatar_url: typeof avatar === 'string' && avatar.length <= 8192 && /^https:\/\//.test(avatar) ? avatar : null,
          interests: Array.isArray(target.row.interests) ? target.row.interests.filter(v => typeof v === 'string' && v.length <= 100).slice(0, 30) : [] };
      }));
      for (const row of rows) if (row && profiles.length < 30) profiles.push(row);
    }
    return receipt(false, profiles);
  });
}
