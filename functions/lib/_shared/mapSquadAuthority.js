import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
const FIELDS = {
    list: ['cursor'], read: ['squadId', 'cursor'], matchMembers: ['squadId', 'candidateProfileIds'], previewInvite: ['token'],
    create: ['requestId', 'name', 'emoji'], recreate: ['requestId', 'legacySquadId', 'expectedRevision'],
    createInvite: ['requestId', 'squadId', 'expectedRevision'], join: ['requestId', 'token'],
    leave: ['requestId', 'squadId', 'expectedMembershipRevision'], archive: ['requestId', 'squadId', 'expectedRevision'],
};
const READS = new Set(['list', 'read', 'matchMembers', 'previewInvite']);
const EMOJIS = ['🗺️', '🔥', '✨', '🎉', '🌴', '🏙️', '⚡', '💜'];
const PAGE = 20, LEASE = 15000, CURSOR_LIFE = 600000, INVITE_LIFE = 86400000;
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => validAudienceId(value) && value !== '.' && value !== '..';
const revision = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const token = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const documentId = (value) => typeof value === 'string' && !!value && !value.includes('/') && value !== '.' && value !== '..' && Buffer.byteLength(value) <= 1500;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const mapSquadHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const mapSquadMembershipId = (squadId, uid, created) => mapSquadHash(['member', squadId, uid, created]);
const freshRevision = () => randomBytes(24).toString('hex');
const invalid = () => { throw new HttpsError('invalid-argument', 'These squad details are invalid.'); };
const changed = () => { throw new HttpsError('failed-precondition', 'Your verified account changed. Reopen Squad Maps.'); };
const stale = () => { throw new HttpsError('aborted', 'This squad changed. Refresh its details before trying again.'); };
const unavailable = () => { throw new HttpsError('permission-denied', 'This squad or invitation is no longer available.'); };
async function boundedMap(values, run) {
    const results = [];
    for (let offset = 0; offset < values.length; offset += PAGE)
        results.push(...await Promise.all(values.slice(offset, offset + PAGE).map(run)));
    return results;
}
function name(value) {
    if (typeof value !== 'string' || !value || value.trim() !== value || value.length > 40 || [...value].some(char => char.charCodeAt(0) < 32))
        invalid();
    return value;
}
function normalize(raw, uid) {
    if (!object(raw) || raw.expectedOwnerUid !== uid)
        return changed();
    const fields = FIELDS[String(raw.action)];
    if (!fields || !id(raw.expectedProfileId) || !Number.isSafeInteger(raw.expectedAccountCreatedAt) || Number(raw.expectedAccountCreatedAt) <= 0
        || Object.keys(raw).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt', ...fields].includes(key)))
        invalid();
    if (!READS.has(String(raw.action)) && !uuid(raw.requestId))
        invalid();
    if (fields.includes('squadId') && !id(raw.squadId))
        invalid();
    if (fields.includes('token') && !token(raw.token))
        invalid();
    if (raw.cursor !== undefined && raw.cursor !== null && !revision(raw.cursor))
        invalid();
    if (fields.includes('expectedRevision') && !revision(raw.expectedRevision))
        invalid();
    if (raw.action === 'recreate' && !id(raw.legacySquadId))
        invalid();
    if (raw.action === 'leave' && !revision(raw.expectedMembershipRevision))
        invalid();
    if (raw.action === 'create') {
        name(raw.name);
        if (typeof raw.emoji !== 'string' || !EMOJIS.includes(raw.emoji))
            invalid();
    }
    if (raw.action === 'matchMembers' && (!Array.isArray(raw.candidateProfileIds) || raw.candidateProfileIds.length > 100
        || raw.candidateProfileIds.some(value => !id(value)) || new Set(raw.candidateProfileIds).size !== raw.candidateProfileIds.length))
        invalid();
    return raw;
}
async function currentAuth(auth, uid, created, required = true) {
    let user;
    try {
        user = await auth.getUser(uid);
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found') {
            if (!required)
                return false;
            return changed();
        }
        throw new HttpsError('unavailable', 'Account ownership could not be checked. Retry shortly.');
    }
    const valid = user.uid === uid && !user.disabled && Date.parse(user.metadata.creationTime) === created;
    if (!valid && required)
        changed();
    return valid;
}
async function resolve(ctx, alias) {
    if (!ctx.identities.has(alias))
        ctx.identities.set(alias, (async () => {
            const actor = await resolveIdentity(ctx.db, ctx.tx, alias);
            if (!actor)
                return null;
            const binding = (await ctx.tx.get(ctx.db.doc(`_account_profile_bindings/${actor.uid}`))).data();
            if (binding?.version !== 1 || binding.status !== 'active' || binding.owner_uid !== actor.uid || binding.profile_id !== actor.profileId
                || !revision(binding.revision) || !Number.isSafeInteger(binding.auth_created_at_ms) || binding.auth_created_at_ms <= 0)
                return null;
            if (!await currentAuth(ctx.auth, actor.uid, binding.auth_created_at_ms, false))
                return null;
            return { ...actor, created: binding.auth_created_at_ms, binding: binding.revision };
        })());
    return ctx.identities.get(alias);
}
async function blocked(ctx, a, b) {
    if (a.uid === b.uid)
        return false;
    const key = [a.uid, b.uid].sort().join(':');
    if (!ctx.blocks.has(key))
        ctx.blocks.set(key, (async () => {
            const [ab, ba] = await Promise.all([
                ctx.tx.get(ctx.db.collection('blocked_users').where('blocker_id', 'in', a.aliases).where('blocked_id', 'in', b.aliases).limit(1)),
                ctx.tx.get(ctx.db.collection('blocked_users').where('blocker_id', 'in', b.aliases).where('blocked_id', 'in', a.aliases).limit(1)),
            ]);
            return !ab.empty || !ba.empty;
        })());
    return ctx.blocks.get(key);
}
async function stateFrom(ctx, snapshot) {
    const row = snapshot.data();
    if (!row)
        return null;
    // A copied old row at a deleted/recreated path cannot revive memberships or invites.
    if (row.version !== 1 || row.id !== snapshot.id || !id(row.id) || !id(row.owner_uid) || !id(row.owner_profile_id)
        || !Number.isSafeInteger(row.owner_created_at_ms) || row.owner_created_at_ms <= 0 || !revision(row.owner_binding_revision)
        || !revision(row.generation) || !revision(row.revision) || !['active', 'archived'].includes(row.status)
        || !Number.isSafeInteger(row.member_count) || row.member_count < 1 || row.member_count > 10000000
        || !token(row.creation_receipt_id) || !snapshot.createTime
        || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
        || typeof row.emoji !== 'string' || !EMOJIS.includes(row.emoji) || typeof row.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(row.color))
        return null;
    try {
        name(row.name);
    }
    catch {
        return null;
    }
    // The source and its original immutable receipt were created in the same
    // transaction. Compare Firestore versions, not serverTimestamp (which differs
    // from createTime in the emulator and is not a document-version guarantee).
    const origin = await ctx.tx.get(ctx.db.doc(`_map_squad_receipts/${row.creation_receipt_id}`)), receipt = origin.data();
    if (!origin.createTime || !origin.createTime.isEqual(snapshot.createTime) || receipt?.version !== 1
        || !['create', 'recreate'].includes(String(receipt.action)) || receipt.squad_id !== row.id || receipt.generation !== row.generation
        || receipt.owner_uid !== row.owner_uid || receipt.profile_id !== row.owner_profile_id || receipt.account_created_at_ms !== row.owner_created_at_ms
        || receipt.binding_revision !== row.owner_binding_revision)
        return null;
    return row;
}
function memberFrom(row, squadId, actor, generation) {
    if (!row)
        return null;
    if (row.version !== 1 || row.squad_id !== squadId || row.owner_uid !== actor.uid || row.profile_id !== actor.profileId
        || row.account_created_at_ms !== actor.created || row.binding_revision !== actor.binding || !revision(row.generation)
        || (generation && row.generation !== generation) || !['owner', 'member'].includes(String(row.role))
        || !['active', 'left'].includes(String(row.status)) || !revision(row.revision)
        || typeof row.joined_at !== 'string' || !Number.isFinite(Date.parse(row.joined_at)))
        return null;
    return row;
}
const memberRef = (ctx, squadId, actor = ctx.actor) => ctx.db.doc(`_map_squad_members/${mapSquadMembershipId(squadId, actor.uid, actor.created)}`);
async function member(ctx, squadId, actor = ctx.actor, generation) {
    return memberFrom((await ctx.tx.get(memberRef(ctx, squadId, actor))).data(), squadId, actor, generation);
}
async function ownerFor(ctx, state) {
    const owner = await resolve(ctx, state.owner_uid);
    const valid = owner && owner.profileId === state.owner_profile_id && owner.created === state.owner_created_at_ms && owner.binding === state.owner_binding_revision ? owner : null;
    if (valid)
        ctx.owners.set(valid.uid, valid.created);
    return valid;
}
async function admit(ctx, squadId, supplied) {
    const snapshot = supplied ?? await ctx.tx.get(ctx.db.doc(`_map_squads/${squadId}`));
    const state = await stateFrom(ctx, snapshot);
    if (!state || state.status !== 'active')
        return null;
    const owner = await ownerFor(ctx, state), mine = await member(ctx, squadId, ctx.actor, state.generation);
    if (!owner || !mine || mine.status !== 'active' || await blocked(ctx, ctx.actor, owner)
        || (mine.role === 'owner') !== (owner.uid === ctx.actor.uid))
        return null;
    return { state, owner, member: mine, snapshot };
}
function membershipDto(value) { return value ? { role: value.role, status: value.status, revision: value.revision } : null; }
function squadDto(state, mine) {
    return { id: state.id, name: state.name, emoji: state.emoji, color: state.color, owner_id: state.owner_profile_id,
        created_at: state.created_at, revision: state.revision, status: 'active', legacy: false, member_count: state.member_count, membership: membershipDto(mine) };
}
function legacyDto(snapshot, actor) {
    const row = snapshot.data();
    if (!row || !id(snapshot.id) || !actor.aliases.includes(String(row.owner_id)) || row.deleted_at || row.is_deleted || row.status === 'archived'
        || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at)) || typeof row.emoji !== 'string' || !EMOJIS.includes(row.emoji)
        || typeof row.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(row.color))
        return null;
    try {
        name(row.name);
    }
    catch {
        return null;
    }
    const version = (value) => value ? [value.seconds, value.nanoseconds] : null;
    return { id: snapshot.id, name: row.name, emoji: row.emoji, color: row.color, owner_id: actor.profileId,
        created_at: row.created_at, revision: mapSquadHash(['legacy', snapshot.id, row, version(snapshot.createTime), version(snapshot.updateTime)]).slice(0, 48),
        status: 'legacy', legacy: true, member_count: 0, membership: null };
}
function identityDto(actor, value) {
    const bounded = (text, max) => typeof text === 'string' && text.length <= max && ![...text].some(char => char.charCodeAt(0) < 32) ? text : null;
    let avatar = null;
    if (typeof actor.row.avatar_url === 'string' && actor.row.avatar_url.length <= 8192) {
        try {
            const parsed = new URL(actor.row.avatar_url);
            if (parsed.protocol === 'https:' && !parsed.username && !parsed.password)
                avatar = parsed.href;
        }
        catch { /* Omit malformed public summary data. */ }
    }
    return { profile_id: actor.profileId, username: bounded(actor.row.username, 80), display_name: bounded(actor.row.display_name, 120), avatar_url: avatar, role: value.role };
}
async function eligibleMember(ctx, admitted, row) {
    if (!row || !id(row.owner_uid))
        return null;
    const actor = await resolve(ctx, row.owner_uid);
    if (!actor)
        return null;
    const valid = memberFrom(row, admitted.state.id, actor, admitted.state.generation);
    if (!valid || valid.status !== 'active' || (valid.role === 'owner') !== (actor.uid === admitted.owner.uid)
        || await blocked(ctx, ctx.actor, actor) || await blocked(ctx, admitted.owner, actor))
        return null;
    ctx.owners.set(actor.uid, actor.created);
    return { actor, member: valid };
}
async function readCursor(ctx, input, scope, targetId) {
    if (!input.cursor)
        return null;
    const row = (await ctx.tx.get(ctx.db.doc(`_map_squad_cursors/${input.cursor}`))).data();
    if (!row || row.version !== 1 || row.owner_uid !== ctx.actor.uid || row.profile_id !== ctx.actor.profileId || row.account_created_at_ms !== ctx.actor.created
        || row.binding_revision !== ctx.actor.binding || row.scope !== scope || row.target_id !== targetId || !(row.expireAt instanceof Timestamp)
        || row.expireAt.toMillis() <= ctx.now || (!documentId(row.last_id) && !(row.phase === 'legacy' && row.last_id === null)) || !['members', 'legacy', 'roster'].includes(String(row.phase))) {
        throw new HttpsError('failed-precondition', 'This squad page expired or changed. Refresh the list.');
    }
    return row;
}
function writeCursor(ctx, scope, targetId, phase, lastId, generation = null) {
    const cursor = freshRevision();
    ctx.tx.create(ctx.db.doc(`_map_squad_cursors/${cursor}`), { version: 1, owner_uid: ctx.actor.uid, profile_id: ctx.actor.profileId,
        account_created_at_ms: ctx.actor.created, binding_revision: ctx.actor.binding, scope, target_id: targetId, phase, last_id: lastId, generation,
        expireAt: Timestamp.fromMillis(ctx.now + CURSOR_LIFE) });
    return cursor;
}
async function inviteFor(ctx, secret) {
    const row = (await ctx.tx.get(ctx.db.doc(`_map_squad_invites/${mapSquadHash(secret)}`))).data();
    if (!row || row.version !== 1 || !id(row.squad_id) || !revision(row.generation) || !Number.isSafeInteger(row.expires_at_ms) || Number(row.expires_at_ms) <= ctx.now)
        return null;
    const snapshot = await ctx.tx.get(ctx.db.doc(`_map_squads/${row.squad_id}`));
    const state = await stateFrom(ctx, snapshot);
    if (!state || state.status !== 'active' || state.generation !== row.generation)
        return null;
    const owner = await ownerFor(ctx, state);
    if (!owner || row.owner_uid !== owner.uid || row.owner_created_at_ms !== owner.created || row.owner_binding_revision !== owner.binding || await blocked(ctx, ctx.actor, owner))
        return null;
    return { state, owner, expiresAt: row.expires_at_ms };
}
function newMember(ctx, squadId, generation, role) {
    return { version: 1, squad_id: squadId, generation, owner_uid: ctx.actor.uid, profile_id: ctx.actor.profileId,
        account_created_at_ms: ctx.actor.created, binding_revision: ctx.actor.binding, role, status: 'active', revision: freshRevision(), joined_at: new Date(ctx.now).toISOString() };
}
/** All squad authority is server issued; legacy rows are metadata for explicit recreation only. */
export async function manageMapSquadForUid(db, auth, uid, raw, now = Date.now()) {
    const started = Date.now(), currentTime = () => now + Math.max(0, Date.now() - started);
    const input = normalize(raw, uid);
    await currentAuth(auth, uid, input.expectedAccountCreatedAt);
    const fingerprint = mapSquadHash(input);
    return db.runTransaction(async (tx) => {
        const ctx = { db, auth, tx, actor: null, now, identities: new Map(), blocks: new Map(), owners: new Map() };
        const actor = await resolve(ctx, uid);
        if (!actor || actor.uid !== uid || actor.profileId !== input.expectedProfileId || actor.created !== input.expectedAccountCreatedAt)
            changed();
        ctx.actor = actor;
        const base = () => ({ ok: true, action: input.action, ownerUid: uid, profileId: ctx.actor.profileId, accountCreatedAt: ctx.actor.created, serverTime: now, validUntil: now + LEASE });
        const finalAuth = async () => {
            await currentAuth(auth, uid, input.expectedAccountCreatedAt);
            await boundedMap([...ctx.owners].filter(([ownerUid]) => ownerUid !== uid), ([ownerUid, created]) => currentAuth(auth, ownerUid, created));
        };
        if (input.action === 'list') {
            const cursor = await readCursor(ctx, input, 'list', null);
            const phase = cursor?.phase || 'members';
            const items = [];
            let next = null;
            if (phase === 'members') {
                let query = db.collection('_map_squad_members').where('owner_uid', '==', uid).where('account_created_at_ms', '==', ctx.actor.created).where('status', '==', 'active').orderBy(FieldPath.documentId()).limit(PAGE + 1);
                if (cursor)
                    query = query.startAfter(cursor.last_id);
                const page = await tx.get(query);
                const projected = await boundedMap(page.docs.slice(0, PAGE), async (doc) => {
                    const squadId = doc.data().squad_id;
                    if (!id(squadId) || doc.id !== mapSquadMembershipId(squadId, uid, ctx.actor.created))
                        return null;
                    const admitted = await admit(ctx, squadId);
                    return admitted ? squadDto(admitted.state, admitted.member) : null;
                });
                items.push(...projected.filter(value => value !== null));
                if (page.size > PAGE)
                    next = { phase: 'members', id: page.docs[PAGE - 1].id };
            }
            if (!next) {
                const remaining = PAGE - items.length;
                let query = db.collection('map_group_maps').where('owner_id', 'in', ctx.actor.aliases).orderBy(FieldPath.documentId()).limit(remaining + 1);
                if (phase === 'legacy' && cursor?.last_id)
                    query = query.startAfter(cursor.last_id);
                const page = await tx.get(query);
                for (const doc of page.docs.slice(0, remaining)) {
                    const dto = legacyDto(doc, ctx.actor);
                    if (dto && !(await tx.get(db.doc(`_map_squad_recreations/${mapSquadHash([uid, ctx.actor.created, dto.id, dto.revision])}`))).exists)
                        items.push(dto);
                }
                if (page.size > remaining)
                    next = { phase: 'legacy', id: remaining ? page.docs[remaining - 1].id : null };
            }
            await finalAuth();
            const nextCursor = next ? writeCursor(ctx, 'list', null, next.phase, next.id) : null;
            return { ...base(), items, nextCursor };
        }
        if (input.action === 'read') {
            const squadId = input.squadId, cursor = await readCursor(ctx, input, 'roster', squadId);
            const snapshot = await tx.get(db.doc(`_map_squads/${squadId}`)), admitted = await admit(ctx, squadId, snapshot);
            if (!admitted) {
                const legacy = !snapshot.exists && !cursor ? legacyDto(await tx.get(db.doc(`map_group_maps/${squadId}`)), ctx.actor) : null;
                await finalAuth();
                return { ...base(), squadId, squad: legacy, members: [], nextCursor: null };
            }
            if (cursor && (cursor.phase !== 'roster' || cursor.generation !== admitted.state.generation))
                stale();
            let query = db.collection('_map_squad_members').where('squad_id', '==', squadId).where('status', '==', 'active').orderBy(FieldPath.documentId()).limit(PAGE + 1);
            if (cursor)
                query = query.startAfter(cursor.last_id);
            const page = await tx.get(query);
            const projected = await boundedMap(page.docs.slice(0, PAGE), async (doc) => {
                const candidate = await eligibleMember(ctx, admitted, doc.data());
                return candidate && doc.id === mapSquadMembershipId(squadId, candidate.actor.uid, candidate.actor.created) ? identityDto(candidate.actor, candidate.member) : null;
            });
            const members = projected.filter(value => value !== null);
            await finalAuth();
            const nextCursor = page.size > PAGE ? writeCursor(ctx, 'roster', squadId, 'roster', page.docs[PAGE - 1].id, admitted.state.generation) : null;
            return { ...base(), squadId, squad: squadDto(admitted.state, admitted.member), members, nextCursor };
        }
        if (input.action === 'matchMembers') {
            const squadId = input.squadId, admitted = await admit(ctx, squadId);
            const matches = admitted ? await boundedMap(input.candidateProfileIds, async (profileId) => {
                const target = await resolve(ctx, profileId);
                if (!target || target.profileId !== profileId)
                    return null;
                const snapshot = await tx.get(memberRef(ctx, squadId, target)), eligible = await eligibleMember(ctx, admitted, snapshot.data());
                return eligible ? eligible.actor.profileId : null;
            }) : [];
            const matchedProfileIds = matches.filter(value => value !== null);
            await finalAuth();
            return { ...base(), squadId, matchedProfileIds };
        }
        if (input.action === 'previewInvite') {
            let found = await inviteFor(ctx, input.token);
            await finalAuth();
            if (found && found.expiresAt <= currentTime())
                found = null;
            return { ...base(), validUntil: found ? Math.min(now + LEASE, found.expiresAt) : now + LEASE, token: input.token, invite: found ? { squad: { id: found.state.id, name: found.state.name, emoji: found.state.emoji,
                        color: found.state.color, owner_id: found.state.owner_profile_id, revision: found.state.revision, member_count: found.state.member_count }, expiresAt: found.expiresAt } : null };
        }
        const receiptRef = db.doc(`_map_squad_receipts/${mapSquadHash([uid, ctx.actor.created, input.requestId])}`);
        const previous = (await tx.get(receiptRef)).data();
        const result = async (squadId, expectedGeneration, invite = null) => {
            const snapshot = await tx.get(db.doc(`_map_squads/${squadId}`)), state = await stateFrom(ctx, snapshot), admitted = await admit(ctx, squadId, snapshot);
            if (state && state.generation !== expectedGeneration) {
                await finalAuth();
                return { ...base(), requestId: input.requestId, squadId, status: 'unavailable', squad: null, membership: null, ...(input.action === 'createInvite' ? { invite: null } : {}) };
            }
            const mine = await member(ctx, squadId, ctx.actor, state?.generation);
            const owner = state && await ownerFor(ctx, state);
            const ownerAllowed = owner?.uid === uid && owner.created === ctx.actor.created;
            const status = admitted ? 'active' : mine?.status === 'left' ? 'left' : state?.status === 'archived' && (ownerAllowed || mine) ? 'archived' : 'unavailable';
            await finalAuth();
            return { ...base(), requestId: input.requestId, squadId, status, squad: admitted ? squadDto(admitted.state, admitted.member) : null, membership: status === 'active' || status === 'left' ? membershipDto(mine) : null,
                ...(input.action === 'createInvite' ? { invite: ownerAllowed && admitted && invite ? { ...invite, active: invite.expiresAt > now } : null } : {}) };
        };
        if (previous) {
            if (previous.version !== 1 || previous.owner_uid !== uid || previous.profile_id !== ctx.actor.profileId || previous.account_created_at_ms !== ctx.actor.created
                || previous.binding_revision !== ctx.actor.binding || previous.fingerprint !== fingerprint || !id(previous.squad_id) || !revision(previous.generation))
                throw new HttpsError('already-exists', 'This squad retry belongs to different details.');
            let storedInvite = null;
            if (input.action === 'createInvite') {
                if (!token(previous.invite_token) || !Number.isSafeInteger(previous.invite_expires_at_ms))
                    stale();
                const row = (await tx.get(db.doc(`_map_squad_invites/${mapSquadHash(previous.invite_token)}`))).data();
                if (row?.version === 1 && row.squad_id === previous.squad_id && row.generation === previous.generation && row.owner_uid === uid
                    && row.owner_created_at_ms === ctx.actor.created && row.owner_binding_revision === ctx.actor.binding && row.expires_at_ms === previous.invite_expires_at_ms)
                    storedInvite = { token: previous.invite_token, expiresAt: previous.invite_expires_at_ms };
            }
            return result(previous.squad_id, previous.generation, storedInvite);
        }
        let squadId, state, mine, invite = null, joinExpiresAt = null;
        const writes = [];
        if (input.action === 'create' || input.action === 'recreate') {
            let title = input.name, emoji = input.emoji, color = '#8b5cf6';
            if (input.action === 'recreate') {
                const legacy = legacyDto(await tx.get(db.doc(`map_group_maps/${input.legacySquadId}`)), ctx.actor);
                if (!legacy || legacy.revision !== input.expectedRevision)
                    stale();
                const recreationRef = db.doc(`_map_squad_recreations/${mapSquadHash([uid, ctx.actor.created, legacy.id, legacy.revision])}`);
                const recreated = (await tx.get(recreationRef)).data();
                if (recreated) {
                    if (recreated.owner_uid !== uid || recreated.account_created_at_ms !== ctx.actor.created || recreated.profile_id !== ctx.actor.profileId
                        || !id(recreated.squad_id) || !revision(recreated.generation))
                        stale();
                    const response = await result(recreated.squad_id, recreated.generation);
                    tx.create(receiptRef, { version: 1, owner_uid: uid, profile_id: ctx.actor.profileId, account_created_at_ms: ctx.actor.created, binding_revision: ctx.actor.binding,
                        fingerprint, action: input.action, squad_id: recreated.squad_id, generation: recreated.generation, created_at_ms: now });
                    return response;
                }
                title = legacy.name;
                emoji = legacy.emoji;
                color = legacy.color;
                writes.push(() => tx.create(recreationRef, { version: 1, owner_uid: uid, profile_id: ctx.actor.profileId, account_created_at_ms: ctx.actor.created,
                    squad_id: squadId, generation: state.generation, source_revision: legacy.revision, created_at_ms: now }));
            }
            squadId = randomUUID();
            state = { version: 1, id: squadId, owner_uid: uid, owner_profile_id: ctx.actor.profileId, owner_created_at_ms: ctx.actor.created,
                owner_binding_revision: ctx.actor.binding, generation: freshRevision(), revision: freshRevision(), creation_receipt_id: receiptRef.id, name: title, emoji, color,
                created_at: new Date(now).toISOString(), status: 'active', member_count: 1 };
            mine = newMember(ctx, squadId, state.generation, 'owner');
            writes.push(() => tx.create(db.doc(`_map_squads/${squadId}`), state), () => tx.create(memberRef(ctx, squadId), mine));
        }
        else if (input.action === 'join') {
            const found = await inviteFor(ctx, input.token);
            if (!found)
                return unavailable();
            squadId = found.state.id;
            state = found.state;
            joinExpiresAt = found.expiresAt;
            const priorSnapshot = await tx.get(memberRef(ctx, squadId)), prior = memberFrom(priorSnapshot.data(), squadId, ctx.actor, state.generation);
            if (priorSnapshot.exists && !prior)
                throw new HttpsError('failed-precondition', 'Your previous squad identity needs review. No membership was changed.');
            if (prior && (prior.role === 'owner') !== (state.owner_uid === uid))
                throw new HttpsError('failed-precondition', 'Your squad role needs review. No membership was changed.');
            if (state.owner_uid === uid && (!prior || prior.role !== 'owner' || prior.status !== 'active'))
                throw new HttpsError('failed-precondition', 'The squad owner membership needs review.');
            if (prior?.status === 'active')
                mine = prior;
            else {
                if (state.member_count >= 10000000)
                    throw new HttpsError('resource-exhausted', 'This squad cannot accept more members.');
                mine = newMember(ctx, squadId, state.generation, 'member');
                state = { ...state, member_count: state.member_count + 1, revision: freshRevision() };
                writes.push(() => tx.set(memberRef(ctx, squadId), mine), () => tx.update(db.doc(`_map_squads/${squadId}`), { member_count: state.member_count, revision: state.revision }));
            }
        }
        else {
            squadId = input.squadId;
            const snapshot = await tx.get(db.doc(`_map_squads/${squadId}`)), parsed = await stateFrom(ctx, snapshot);
            const prior = await member(ctx, squadId, ctx.actor, parsed?.generation);
            if (input.action === 'leave') {
                if (!prior || prior.role === 'owner')
                    throw new HttpsError('failed-precondition', 'Only a squad member can leave. Owners can archive their squad.');
                if (prior.revision !== input.expectedMembershipRevision)
                    stale();
                mine = prior.status === 'left' ? prior : { ...prior, status: 'left', revision: freshRevision() };
                if (prior.status !== 'left')
                    writes.push(() => tx.set(memberRef(ctx, squadId), mine));
                if (parsed && parsed.status === 'active' && prior.status === 'active') {
                    if (parsed.member_count <= 1)
                        throw new HttpsError('failed-precondition', 'This squad membership count needs review.');
                    state = { ...parsed, member_count: parsed.member_count - 1, revision: freshRevision() };
                    writes.push(() => tx.update(db.doc(`_map_squads/${squadId}`), { member_count: state.member_count, revision: state.revision }));
                }
                else
                    state = parsed;
            }
            else {
                const admitted = await admit(ctx, squadId, snapshot);
                if (!admitted || admitted.member.role !== 'owner')
                    return unavailable();
                state = admitted.state;
                mine = admitted.member;
                if (input.expectedRevision !== state.revision)
                    stale();
                if (input.action === 'archive') {
                    state = { ...state, status: 'archived', revision: freshRevision() };
                    writes.push(() => tx.update(db.doc(`_map_squads/${squadId}`), { status: state.status, revision: state.revision }));
                }
                else if (input.action === 'createInvite') {
                    invite = { token: randomBytes(32).toString('hex'), expiresAt: now + INVITE_LIFE };
                    writes.push(() => tx.create(db.doc(`_map_squad_invites/${mapSquadHash(invite.token)}`), { version: 1, squad_id: squadId, generation: state.generation,
                        owner_uid: uid, owner_created_at_ms: ctx.actor.created, owner_binding_revision: ctx.actor.binding, expires_at_ms: invite.expiresAt, expireAt: Timestamp.fromMillis(invite.expiresAt) }));
                }
                else
                    return invalid();
            }
        }
        // Finish every admission/Auth read before scheduling transaction writes.
        let admitted = state?.status === 'active' && mine.status === 'active';
        if (admitted && input.action === 'leave')
            admitted = false;
        await finalAuth();
        if (joinExpiresAt !== null && joinExpiresAt <= currentTime())
            return unavailable();
        writes.forEach(write => write());
        tx.create(receiptRef, { version: 1, owner_uid: uid, profile_id: ctx.actor.profileId, account_created_at_ms: ctx.actor.created, binding_revision: ctx.actor.binding,
            fingerprint, action: input.action, squad_id: squadId, generation: state?.generation || mine.generation, created_at_ms: now, ...(invite ? { invite_token: invite.token, invite_expires_at_ms: invite.expiresAt } : {}) });
        const status = mine.status === 'left' ? 'left' : state?.status === 'archived' ? 'archived' : admitted ? 'active' : 'unavailable';
        return { ...base(), requestId: input.requestId, squadId, status,
            squad: admitted ? squadDto(state, mine) : null, membership: status === 'active' || status === 'left' ? membershipDto(mine) : null, ...(input.action === 'createInvite' ? { invite: invite ? { ...invite, active: true } : null } : {}) };
    });
}
//# sourceMappingURL=mapSquadAuthority.js.map