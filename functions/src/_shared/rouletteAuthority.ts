import { createHash, randomUUID } from 'node:crypto';
import type { Firestore, Transaction, DocumentReference } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, type AudienceIdentity } from './profileAudienceAuthority.js';
import { readParentalRow } from './parentalAccountAuthority.js';
import { captureTokenAccount, assertTokenAccountCurrent, type TokenAccountContext, type TokenAccountLookup } from './tokenAccountAdmission.js';

type Row = Record<string, unknown>;
export type RouletteMode = 'text' | 'audio' | 'video';
export const rouletteInterests = ['Music', 'Gaming', 'Art', 'Tech', 'Fashion', 'Sports', 'Anime', 'Movies', 'Cooking', 'Travel', 'Fitness', 'Photography', 'Crypto', 'Comedy', 'Books', 'Nature'];
type Action = 'join' | 'poll' | 'cancel' | 'end' | 'handoff';
export type RouletteInput = { action: Action; expectedOwnerUid: string; expectedProfileId: string; requestId: string; mode?: RouletteMode; interests?: string[]; matchId?: string };
type Stamp = { uid: string; profileId: string; createdAtMs: number; bindingRevision: string; key: string };
type Actor = Stamp & { account: TokenAccountContext; identity: AudienceIdentity };
type Lease = Stamp & { version: 1; kind: 'lease'; requestId: string; mode: RouletteMode; interests: string[]; status: 'searching' | 'matched' | 'cancelled' | 'ended'; matchId: string | null; joinedAt: number; expiresAt: number; authTime: number };
type Participant = Stamp & { requestId: string };
type Match = { version: 1; id: string; participants: [Participant, Participant]; mode: RouletteMode; sharedInterests: string[]; status: 'active' | 'ended'; startedAt: number; conversationId: string | null; callStarterKey: string | null };
type Context = { db: Firestore; tx: Transaction; lookup: TokenAccountLookup; now: number; clock: () => number; checks: TokenAccountContext[]; writes: Array<() => void> };
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/') && ![...value].some(character => character.charCodeAt(0) < 32);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const mode = (value: unknown): value is RouletteMode => ['text', 'audio', 'video'].includes(String(value));
const interests = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 5 && new Set(value).size === value.length && value.every(item => typeof item === 'string' && rouletteInterests.includes(item));
const changed = () => new HttpsError('failed-precondition', 'Your account or search changed. Reopen Roulette.');
const same = (left: Stamp, right: Stamp) => left.uid === right.uid && left.profileId === right.profileId && left.createdAtMs === right.createdAtMs && left.bindingRevision === right.bindingRevision && left.key === right.key;
const stamp = (actor: Stamp): Stamp => ({ uid: actor.uid, profileId: actor.profileId, createdAtMs: actor.createdAtMs, bindingRevision: actor.bindingRevision, key: actor.key });
const keyFor = (uid: string, profileId: string, createdAtMs: number, revision: string) => createHash('sha256').update(JSON.stringify([uid, profileId, createdAtMs, revision])).digest('hex');
const validStamp = (row: unknown): row is Stamp & Row => object(row) && id(row.uid) && id(row.profileId) && Number.isSafeInteger(row.createdAtMs) && Number(row.createdAtMs) > 0
  && typeof row.bindingRevision === 'string' && /^[a-f0-9]{48}$/.test(row.bindingRevision) && row.key === keyFor(row.uid, row.profileId, Number(row.createdAtMs), row.bindingRevision);
const validLease = (row: unknown, actor: Stamp): row is Lease => validStamp(row) && same(row, actor) && object(row) && row.version === 1 && row.kind === 'lease' && uuid(row.requestId)
  && mode(row.mode) && interests(row.interests) && ['searching', 'matched', 'cancelled', 'ended'].includes(String(row.status))
  && (row.matchId === null || id(row.matchId)) && (row.status !== 'searching' || row.matchId === null) && Number.isSafeInteger(row.joinedAt) && Number(row.joinedAt) >= 0 && Number.isSafeInteger(row.expiresAt) && Number(row.expiresAt) >= 0 && Number.isSafeInteger(row.authTime) && Number(row.authTime) > 0;
const live = (lease: Lease, now: number) => (lease.status === 'searching' || lease.status === 'matched') && lease.expiresAt > now;
const operationRef = (db: Firestore, actor: Stamp, requestId: string) => db.doc(`_roulette_requests/${actor.key}/operations/${requestId}`);
const sessionRef = (db: Firestore, actor: Stamp) => db.doc(`_roulette_sessions/${actor.key}`);
const queueRef = (db: Firestore, actor: Stamp, selectedMode: RouletteMode) => db.doc(`_roulette_waiting_${selectedMode}/${actor.key}`);
const write = (context: Context, ref: DocumentReference, row: object) => context.writes.push(() => { context.tx.set(ref, row); });
const remove = (context: Context, ref: DocumentReference) => context.writes.push(() => { context.tx.delete(ref); });
const putLease = (context: Context, lease: Lease, updateSession = true) => {
  write(context, operationRef(context.db, lease, lease.requestId), lease);
  if (updateSession) write(context, sessionRef(context.db, lease), lease);
};

export function normalizeRouletteInput(raw: unknown, uid: string): RouletteInput {
  if (!object(raw) || raw.expectedOwnerUid !== uid) throw changed();
  if (!id(raw.expectedProfileId) || !uuid(raw.requestId) || !['join', 'poll', 'cancel', 'end', 'handoff'].includes(String(raw.action))
    || Object.keys(raw).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', 'requestId', 'mode', 'interests', 'matchId'].includes(key))) throw new HttpsError('invalid-argument', 'Invalid Roulette request.');
  if (raw.action === 'join') {
    if (!mode(raw.mode) || !interests(raw.interests) || raw.matchId !== undefined) throw new HttpsError('invalid-argument', 'Choose a mode and up to five vibes.');
  } else if (raw.mode !== undefined || raw.interests !== undefined) throw new HttpsError('invalid-argument', 'Search choices cannot change during a session.');
  if ((raw.action === 'end' || raw.action === 'handoff') ? !id(raw.matchId) : raw.matchId !== undefined) throw new HttpsError('invalid-argument', 'Open the current match again.');
  return raw as RouletteInput;
}

async function actorFor(context: Context, uid: string, account: TokenAccountContext, expectedProfileId?: string, expected?: Stamp): Promise<Actor> {
  const [identity, bindingDoc] = await Promise.all([resolveIdentity(context.db, context.tx, uid), context.tx.get(context.db.doc(`_account_profile_bindings/${uid}`))]);
  const binding = bindingDoc.data();
  if (!identity || identity.uid !== uid || (expectedProfileId && identity.profileId !== expectedProfileId) || identity.row.is_banned === true
    || identity.row.deletion_requested_at || identity.row.scheduled_purge_at || binding?.version !== 1 || binding.owner_uid !== uid || binding.status !== 'active'
    || binding.profile_id !== identity.profileId || binding.auth_created_at_ms !== Math.floor(account.createdAtMs / 1000) * 1000
    || typeof binding.revision !== 'string' || !/^[a-f0-9]{48}$/.test(binding.revision)) throw changed();
  const actor: Actor = { uid, profileId: identity.profileId, createdAtMs: account.createdAtMs, bindingRevision: binding.revision,
    key: keyFor(uid, identity.profileId, account.createdAtMs, binding.revision), account, identity };
  if (expected && !same(actor, expected)) throw changed();
  return actor;
}
async function featureAllowed(context: Context, actor: Actor) {
  const controls = await readParentalRow(context.db, context.tx, { uid: actor.uid, profileId: actor.profileId, created: Math.floor(actor.createdAtMs / 1000) * 1000, authTime: actor.account.authTime, bindingRevision: actor.bindingRevision });
  if (controls && typeof controls.is_active !== 'boolean') throw changed();
  if (controls && controls.is_active !== false && (!Array.isArray(controls.allowed_features) || !controls.allowed_features.includes('roulette'))) {
    throw new HttpsError('permission-denied', 'Roulette is unavailable with your current parental controls.');
  }
}
async function blocked(context: Context, left: Actor, right: Actor) {
  const aliases = left.identity.aliases.flatMap(a => right.identity.aliases.map(b => [a, b]));
  const results = await Promise.all(aliases.flatMap(([a, b]) => [
    context.tx.get(context.db.collection('blocked_users').where('blocker_id', '==', a).where('blocked_id', '==', b).limit(1)),
    context.tx.get(context.db.collection('blocked_users').where('blocker_id', '==', b).where('blocked_id', '==', a).limit(1)),
  ]));
  return results.some(result => !result.empty);
}
const expectedDenial = (error: unknown) => error instanceof HttpsError && ['failed-precondition', 'permission-denied', 'unauthenticated', 'not-found'].includes(error.code);
async function peerActor(context: Context, lease: Lease): Promise<Actor> {
  const account = await captureTokenAccount(lease.uid, { sub: lease.uid, auth_time: lease.authTime }, context.lookup, context.clock);
  const actor = await actorFor(context, lease.uid, account, lease.profileId, lease);
  await featureAllowed(context, actor); return actor;
}
function reply(actor: Actor, input: RouletteInput, lease?: Lease, match: Row | null = null, resumed = false) {
  return { ok: true as const, ownerUid: actor.uid, profileId: actor.profileId, requestId: input.requestId, searchId: lease?.requestId || input.requestId,
    state: !lease || lease.status === 'cancelled' ? 'idle' : lease.status === 'searching' ? 'searching' : lease.status === 'matched' && match ? 'matched' : 'ended',
    mode: lease?.mode || 'text', interests: lease?.interests || [], expiresAt: lease?.expiresAt || 0, match, ...(resumed ? { resumed: true } : {}) };
}
function publicMatch(match: Match, peer: Actor) {
  const starter = match.participants.find(participant => participant.key === match.callStarterKey);
  return { id: match.id, user_a: match.participants[0].profileId, user_b: match.participants[1].profileId, mode: match.mode, shared_interests: match.sharedInterests,
    status: 'active', conversation_id: match.conversationId, started_at: new Date(match.startedAt).toISOString(), call_starter_profile_id: starter?.profileId || null,
    partner: { id: peer.profileId, username: typeof peer.identity.row.username === 'string' && peer.identity.row.username ? peer.identity.row.username : 'vybe',
      display_name: typeof peer.identity.row.display_name === 'string' ? peer.identity.row.display_name : null,
      avatar_url: typeof peer.identity.row.avatar_url === 'string' ? peer.identity.row.avatar_url : null } };
}
async function getMatch(context: Context, lease: Lease): Promise<Match> {
  if (!lease.matchId) throw changed();
  const row = (await context.tx.get(context.db.doc(`_roulette_matches/${lease.matchId}`))).data();
  if (!row || row.version !== 1 || row.id !== lease.matchId || !Array.isArray(row.participants) || row.participants.length !== 2
    || row.participants.some(participant => !validStamp(participant) || !uuid(participant.requestId))
    || row.participants[0].uid === row.participants[1].uid || row.participants[0].key === row.participants[1].key
    || !row.participants.some(participant => same(participant, lease) && participant.requestId === lease.requestId)
    || row.mode !== lease.mode || !interests(row.sharedInterests) || !['active', 'ended'].includes(row.status) || !Number.isSafeInteger(row.startedAt) || row.startedAt < 1
    || !(row.conversationId === null || id(row.conversationId)) || !(row.callStarterKey === null || row.participants.some(p => p.key === row.callStarterKey))) throw changed();
  return row as Match;
}
async function endLease(context: Context, lease: Lease, reason: string): Promise<Lease> {
  if (lease.matchId) {
    const match = await getMatch(context, lease);
    const records = await Promise.all(match.participants.map(async participant => ({ participant,
      op: (await context.tx.get(operationRef(context.db, participant, participant.requestId))).data(),
      session: (await context.tx.get(sessionRef(context.db, participant))).data(),
      queue: (await context.tx.get(queueRef(context.db, participant, match.mode))).data(),
    })));
    for (const { participant, op, session, queue } of records) {
      if (validLease(op, participant) && op.requestId === participant.requestId && op.matchId === match.id) {
        const ended: Lease = { ...op, status: 'ended', expiresAt: 0 };
        putLease(context, ended, validLease(session, participant) && session.requestId === participant.requestId && session.matchId === match.id);
        if (validLease(queue, participant) && queue.requestId === participant.requestId) remove(context, queueRef(context.db, participant, op.mode));
      }
    }
    if (match.status !== 'ended') write(context, context.db.doc(`_roulette_matches/${match.id}`), { ...match, status: 'ended', endedAt: context.now, endedReason: reason });
  } else {
    const current = (await context.tx.get(sessionRef(context.db, lease))).data();
    const queue = (await context.tx.get(queueRef(context.db, lease, lease.mode))).data();
    putLease(context, { ...lease, status: reason === 'cancelled' ? 'cancelled' : 'ended', expiresAt: 0 }, validLease(current, lease) && current.requestId === lease.requestId);
    if (validLease(queue, lease) && queue.requestId === lease.requestId) remove(context, queueRef(context.db, lease, lease.mode));
  }
  return { ...lease, status: reason === 'cancelled' && !lease.matchId ? 'cancelled' : 'ended', expiresAt: 0 };
}
async function handoff(context: Context, actor: Actor, peer: Actor, match: Match): Promise<Match> {
  const conversationId = match.conversationId || `roulette-${match.id}`, conversation = context.db.doc(`conversations/${conversationId}`);
  const parent = await context.tx.get(conversation);
  const participants = [...new Set([actor.uid, actor.profileId, peer.uid, peer.profileId])];
  const memberRefs = participants.map(value => context.db.doc(`conversation_members/${conversationId}_${value}`));
  const members = await Promise.all(memberRefs.map(ref => context.tx.get(ref)));
  if (parent.exists) {
    const row = parent.data()!;
    if (row.roulette_match_id !== match.id || row.is_group !== false || !Array.isArray(row.member_ids) || row.member_ids.length !== participants.length || participants.some(value => !row.member_ids.includes(value))) throw changed();
  }
  if (members.some((snapshot, index) => snapshot.exists && (snapshot.data()?.conversation_id !== conversationId || snapshot.data()?.user_id !== participants[index]))) throw changed();
  const now = new Date(context.now).toISOString();
  if (!parent.exists) context.writes.push(() => { context.tx.create(conversation, { id: conversationId, roulette_match_id: match.id, is_group: false, member_ids: participants, name: null, avatar_url: null, created_by: actor.profileId, created_at: now, updated_at: now }); });
  members.forEach((snapshot, index) => { if (!snapshot.exists) context.writes.push(() => { context.tx.create(memberRefs[index], { id: memberRefs[index].id, conversation_id: conversationId, user_id: participants[index], role: 'member', is_muted: false, is_pinned: false, last_read_at: null, created_at: now, updated_at: now }); }); });
  const next = { ...match, conversationId, callStarterKey: match.mode === 'text' ? null : match.callStarterKey || actor.key };
  write(context, context.db.doc(`_roulette_matches/${match.id}`), next); return next;
}

async function run(context: Context, actor: Actor, input: RouletteInput, generatedMatchId: string) {
  const requested = operationRef(context.db, actor, input.requestId), requestedRow = (await context.tx.get(requested)).data();
  let canonicalId = input.requestId, resumed = false;
  if (requestedRow?.kind === 'alias') {
    if (!validStamp(requestedRow) || !same(requestedRow, actor) || requestedRow.version !== 1 || !uuid(requestedRow.targetId) || requestedRow.targetId === input.requestId) throw changed();
    canonicalId = requestedRow.targetId; resumed = true;
  }
  let row = canonicalId === input.requestId ? requestedRow : (await context.tx.get(operationRef(context.db, actor, canonicalId))).data();
  if (canonicalId !== input.requestId && !row) throw changed();
  if (row && (!validLease(row, actor) || row.requestId !== canonicalId)) throw changed();
  if (!row && input.action === 'cancel') {
    const tombstone: Lease = { ...stamp(actor), version: 1, kind: 'lease', requestId: input.requestId, mode: 'text', interests: [], status: 'cancelled', matchId: null, joinedAt: context.now, expiresAt: 0, authTime: actor.account.authTime };
    write(context, requested, tombstone); return reply(actor, input, tombstone);
  }
  if (!row && input.action !== 'join') {
    if (input.action === 'end' || input.action === 'handoff') throw new HttpsError('permission-denied', 'This is not your current match.');
    return reply(actor, input);
  }
  const session = (await context.tx.get(sessionRef(context.db, actor))).data();
  if (session && !validLease(session, actor)) throw changed();
  if (!row && session && validLease(session, actor) && live(session, context.now)) {
    const prior = (await context.tx.get(operationRef(context.db, actor, session.requestId))).data();
    if (!validLease(prior, actor) || prior.requestId !== session.requestId || prior.status !== session.status || prior.matchId !== session.matchId || !live(prior, context.now)) throw changed();
    canonicalId = prior.requestId; row = prior; resumed = true;
    write(context, requested, { ...stamp(actor), version: 1, kind: 'alias', requestId: input.requestId, targetId: canonicalId, createdAt: context.now });
  }
  let lease: Lease;
  if (!row) lease = { ...stamp(actor), version: 1, kind: 'lease', requestId: input.requestId, mode: input.mode!, interests: [...input.interests!], status: 'searching', matchId: null, joinedAt: context.now, expiresAt: context.now + 30_000, authTime: actor.account.authTime };
  else {
    lease = row as Lease;
    if (input.action === 'join' && !resumed && (input.mode !== lease.mode || JSON.stringify(input.interests) !== JSON.stringify(lease.interests))) throw new HttpsError('already-exists', 'This search receipt already belongs to different choices. Start a new search.');
    if (!live(lease, context.now) || !validLease(session, actor) || session.requestId !== lease.requestId) {
      if (lease.status === 'searching' || lease.status === 'matched') lease = await endLease(context, lease, 'expired');
      return reply(actor, input, lease, null, resumed);
    }
  }
  if (input.action === 'end' || input.action === 'handoff') {
    if (!lease.matchId || input.matchId !== lease.matchId) throw new HttpsError('permission-denied', 'This is not your current match.');
  }
  if (input.action === 'cancel' || input.action === 'end') return reply(actor, input, await endLease(context, lease, input.action === 'cancel' ? 'cancelled' : 'ended'), null, resumed);
  await featureAllowed(context, actor);
  if (lease.status === 'matched') {
    let match = await getMatch(context, lease);
    const other = match.participants.find(participant => participant.key !== actor.key)!;
    const [peerOperation, peerSession] = await Promise.all([context.tx.get(operationRef(context.db, other, other.requestId)), context.tx.get(sessionRef(context.db, other))]);
    const peerLease = peerOperation.data(), peerCurrent = peerSession.data();
    if (match.status !== 'active' || !validLease(peerLease, other) || !validLease(peerCurrent, other) || !live(peerLease, context.now) || !live(peerCurrent, context.now)
      || peerLease.status !== 'matched' || peerCurrent.status !== 'matched' || peerLease.matchId !== match.id || peerCurrent.matchId !== match.id || peerCurrent.requestId !== other.requestId) {
      return reply(actor, input, await endLease(context, lease, 'participant-left'), null, resumed);
    }
    let peer: Actor;
    try { peer = await peerActor(context, peerLease); }
    catch (error) { if (!expectedDenial(error)) throw error; return reply(actor, input, await endLease(context, lease, 'participant-unavailable'), null, resumed); }
    if (await blocked(context, actor, peer)) return reply(actor, input, await endLease(context, lease, 'participant-unavailable'), null, resumed);
    context.checks.push(peer.account);
    lease = { ...lease, authTime: actor.account.authTime, expiresAt: context.now + 60_000 }; putLease(context, lease);
    if (input.action === 'handoff') match = await handoff(context, actor, peer, match);
    return reply(actor, input, lease, publicMatch(match, peer), resumed);
  }
  // A single-field expiration query excludes abandoned leases without a new
  // global scheduler, broad data scan or public queue access.
  const candidates = await context.tx.get(context.db.collection(`_roulette_waiting_${lease.mode}`).where('expiresAt', '>', context.now).orderBy('expiresAt', 'asc').limit(32));
  const choices = candidates.docs.map(doc => ({ doc, row: doc.data() })).filter(candidate => candidate.doc.id !== actor.key && validStamp(candidate.row) && candidate.doc.id === candidate.row.key && validLease(candidate.row, candidate.row) && candidate.row.status === 'searching' && candidate.row.mode === lease.mode)
    .sort((a, b) => {
      const score = (value: Row) => (value.interests as string[]).filter(interest => lease.interests.includes(interest)).length;
      return score(b.row) - score(a.row) || Number(a.row.joinedAt) - Number(b.row.joinedAt);
    });
  for (const candidate of choices.slice(0, 12)) {
    const queued = candidate.row as Lease;
    if (queued.uid === actor.uid) continue;
    const [otherSession, otherOperation] = await Promise.all([context.tx.get(sessionRef(context.db, queued)), context.tx.get(operationRef(context.db, queued, queued.requestId))]);
    const otherCurrent = otherSession.data(), otherLease = otherOperation.data();
    if (!validLease(otherCurrent, queued) || !validLease(otherLease, queued) || !live(otherCurrent, context.now) || !live(otherLease, context.now)
      || otherCurrent.status !== 'searching' || otherLease.status !== 'searching' || otherCurrent.requestId !== queued.requestId || otherLease.requestId !== queued.requestId || otherCurrent.mode !== lease.mode || otherLease.mode !== lease.mode
      || JSON.stringify(queued.interests) !== JSON.stringify(otherLease.interests)) continue;
    let peer: Actor;
    try { peer = await peerActor(context, otherLease); }
    catch (error) { if (!expectedDenial(error)) throw error; continue; }
    if (await blocked(context, actor, peer)) continue;
    context.checks.push(peer.account);
    const participants: [Participant, Participant] = [{ ...stamp(actor), requestId: lease.requestId }, { ...stamp(peer), requestId: otherLease.requestId }];
    const match: Match = { version: 1, id: generatedMatchId, participants, mode: lease.mode, sharedInterests: lease.interests.filter(interest => otherLease.interests.includes(interest)), status: 'active', startedAt: context.now, conversationId: null, callStarterKey: null };
    const own: Lease = { ...lease, status: 'matched', matchId: match.id, expiresAt: context.now + 60_000, authTime: actor.account.authTime };
    putLease(context, own); putLease(context, { ...otherLease, status: 'matched', matchId: match.id, expiresAt: context.now + 60_000 });
    remove(context, queueRef(context.db, actor, lease.mode)); remove(context, queueRef(context.db, peer, lease.mode));
    context.writes.push(() => { context.tx.create(context.db.doc(`_roulette_matches/${match.id}`), match); });
    return reply(actor, input, own, publicMatch(match, peer), resumed);
  }
  lease = { ...lease, expiresAt: context.now + 30_000, authTime: actor.account.authTime }; putLease(context, lease); write(context, queueRef(context.db, actor, lease.mode), lease);
  return reply(actor, input, lease, null, resumed);
}

/** All private mutations and participant proofs share one transaction. Auth
 * creation/revocation is rechecked before any queued writes may commit. */
export async function manageRoulette(database: Firestore, lookup: TokenAccountLookup, uid: string, claims: Row, raw: unknown, clock = Date.now) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to use Roulette.');
  const input = normalizeRouletteInput(raw, uid), account = await captureTokenAccount(uid, claims, lookup, clock), matchId = randomUUID();
  return database.runTransaction(async tx => {
    const context: Context = { db: database, tx, lookup, now: clock(), clock, checks: [], writes: [] };
    const actor = await actorFor(context, uid, account, input.expectedProfileId);
    context.checks.push(account);
    const result = await run(context, actor, input, matchId);
    for (const checked of new Set(context.checks)) await assertTokenAccountCurrent(checked);
    context.writes.forEach(apply => apply()); return result;
  });
}
