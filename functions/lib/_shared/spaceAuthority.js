import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
const actions = ['list', 'read', 'create', 'join', 'leave', 'mute', 'hand', 'role', 'end', 'audio'];
const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const digest = (parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const spaceMemberId = (spaceId, uid) => digest(['space-member-v1', spaceId, uid]);
const speaker = (role) => ['host', 'co_host', 'speaker'].includes(String(role));
const fail = () => new HttpsError('failed-precondition', 'This room changed. Refresh it and try again.');
const denied = () => new HttpsError('permission-denied', 'You cannot make this room change.');
const integer = (v) => Number.isSafeInteger(v) && Number(v) >= 0;
const ownershipProof = (row) => validAudienceId(row.owner_uid) && validAudienceId(row.profile_id)
    && typeof row.binding === 'string' && /^[a-f0-9]{48}$/.test(row.binding) && integer(row.auth_created_at_ms) && Number(row.auth_created_at_ms) > 0;
const validRoomProof = (row, id) => row.version === 1 && row.id === id && ownershipProof(row)
    && ['live', 'scheduled', 'ended'].includes(String(row.status)) && integer(row.revision) && Number(row.revision) > 0
    && ['listener_count', 'participant_count', 'speaker_count', 'peak_listeners', 'max_speakers'].every(key => integer(row[key]))
    && Number(row.participant_count) <= 200 && Number(row.listener_count) <= Number(row.participant_count)
    && Number(row.speaker_count) <= Number(row.participant_count) && Number(row.speaker_count) <= Number(row.max_speakers)
    && Number(row.peak_listeners) >= Number(row.listener_count) && Number(row.max_speakers) > 0 && Number(row.max_speakers) <= 200;
const validMemberProof = (row, id) => row.version === 1 && row.space_id === id && ownershipProof(row)
    && row.id === spaceMemberId(id, row.owner_uid) && integer(row.revision) && Number(row.revision) > 0
    && ['host', 'co_host', 'speaker', 'listener', 'requested'].includes(String(row.role))
    && typeof row.is_muted === 'boolean' && typeof row.raised_hand === 'boolean';
export function normalizeSpaceInput(raw, uid) {
    if (!object(raw))
        throw new HttpsError('invalid-argument', 'Room details are required.');
    if (raw.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen the room.');
    if (!validAudienceId(raw.expectedProfileId) || !actions.includes(raw.action))
        throw new HttpsError('invalid-argument', 'Invalid room request.');
    const fields = {
        list: ['status'], read: ['spaceId'], create: ['requestId', 'title', 'description', 'tags', 'scheduledAt'],
        join: ['requestId', 'spaceId', 'revision', 'role'], leave: ['requestId', 'spaceId', 'revision'],
        mute: ['requestId', 'spaceId', 'revision', 'isMuted'], hand: ['requestId', 'spaceId', 'revision', 'raised'],
        role: ['requestId', 'spaceId', 'revision', 'participantId', 'role'], end: ['requestId', 'spaceId', 'revision'], audio: ['spaceId'],
    };
    const action = raw.action;
    if (Object.keys(raw).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', ...fields[action]].includes(key)))
        throw new HttpsError('invalid-argument', 'Unexpected room details.');
    if (action !== 'list' && action !== 'create' && !validAudienceId(raw.spaceId))
        throw new HttpsError('invalid-argument', 'A valid room is required.');
    if (!['list', 'read', 'audio'].includes(action)) {
        if (typeof raw.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(raw.requestId))
            throw new HttpsError('invalid-argument', 'A valid room change is required.');
        if (action !== 'create' && !(Number.isSafeInteger(raw.revision) && Number(raw.revision) >= 0))
            throw new HttpsError('invalid-argument', 'Refresh the room before changing it.');
    }
    if (action === 'list' && raw.status !== undefined && !['live', 'scheduled'].includes(String(raw.status)))
        throw new HttpsError('invalid-argument', 'Invalid room filter.');
    if (action === 'join' && raw.role !== undefined && !['listener', 'requested'].includes(String(raw.role)))
        throw new HttpsError('invalid-argument', 'Invalid joining role.');
    if (action === 'role' && (!validAudienceId(raw.participantId) || !['co_host', 'speaker', 'listener'].includes(String(raw.role))))
        throw new HttpsError('invalid-argument', 'Invalid participant role.');
    if ((action === 'mute' && typeof raw.isMuted !== 'boolean') || (action === 'hand' && typeof raw.raised !== 'boolean'))
        throw new HttpsError('invalid-argument', 'Invalid participant change.');
    if (action === 'create') {
        if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 120
            || (raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 2000))
            || (raw.tags !== undefined && (!Array.isArray(raw.tags) || raw.tags.length > 10 || raw.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 40)))
            || (raw.scheduledAt !== undefined && (typeof raw.scheduledAt !== 'string' || !Number.isFinite(Date.parse(raw.scheduledAt)))))
            throw new HttpsError('invalid-argument', 'Check the room title, description and schedule.');
    }
    return raw;
}
async function actorFor(db, tx, auth, uid, profileId) {
    const binding = (await tx.get(db.doc(`_account_profile_bindings/${uid}`))).data();
    if (binding?.version !== 1 || binding.status !== 'active' || binding.owner_uid !== uid || binding.profile_id !== profileId
        || !Number.isSafeInteger(binding.auth_created_at_ms) || Number(binding.auth_created_at_ms) <= 0
        || typeof binding.revision !== 'string' || !/^[a-f0-9]{48}$/.test(binding.revision))
        throw new HttpsError('failed-precondition', 'Your profile needs to be loaded before opening rooms.');
    const identity = await resolveIdentity(db, tx, uid);
    if (!identity || identity.uid !== uid || identity.profileId !== profileId)
        throw fail();
    let current;
    try {
        current = await auth.getUser(uid);
    }
    catch (error) {
        if (error.code === 'auth/user-not-found')
            throw new HttpsError('unauthenticated', 'Sign in again to open rooms.');
        throw new HttpsError('unavailable', 'Account verification is unavailable. Please retry.');
    }
    if (current.disabled || current.uid !== uid || Date.parse(current.metadata.creationTime) !== binding.auth_created_at_ms)
        throw denied();
    return { ...identity, binding: binding.revision, created: binding.auth_created_at_ms };
}
const owns = (row, actor) => row?.owner_uid === actor.uid && row.profile_id === actor.profileId
    && row.binding === actor.binding && row.auth_created_at_ms === actor.created;
const profileView = (actor) => ({ id: actor.profileId, username: typeof actor.row.username === 'string' ? actor.row.username : '', display_name: typeof actor.row.display_name === 'string' ? actor.row.display_name : null, avatar_url: typeof actor.row.avatar_url === 'string' ? actor.row.avatar_url : null });
function memberView(row) {
    return { id: row.id, space_id: row.space_id, user_id: row.owner_uid, role: row.role, is_muted: row.is_muted,
        raised_hand: row.raised_hand, joined_at: row.joined_at, left_at: row.left_at, revision: row.revision, profile: row.profile };
}
function roomView(row) {
    return { id: row.id, host_id: row.owner_uid, title: row.title, description: row.description, cover_image_url: null,
        status: row.status, scheduled_at: row.scheduled_at, started_at: row.started_at, ended_at: row.ended_at,
        max_speakers: row.max_speakers, allow_requests: row.allow_requests, listener_count: row.listener_count,
        peak_listeners: row.peak_listeners, tags: row.tags, created_at: row.created_at, host: row.profile,
        daily_room_name: null, daily_room_url: null, revision: row.revision };
}
/** Server-owned rooms and memberships. Historical client-written roles do not confer audio grants. */
export async function manageSpaceAuthority(db, auth, uid, raw, now = Date.now()) {
    const input = normalizeSpaceInput(raw, uid);
    const fingerprint = digest([Object.entries(input).sort(([a], [b]) => a.localeCompare(b))]);
    return db.runTransaction(async (tx) => {
        const actor = await actorFor(db, tx, auth, uid, input.expectedProfileId);
        const base = { ok: true, ownerUid: uid, profileId: actor.profileId, action: input.action };
        const hosts = new Map([[JSON.stringify([actor.uid, actor.profileId]), Promise.resolve(actor)]]);
        const roomHost = (row) => {
            const key = JSON.stringify([row.owner_uid, row.profile_id]);
            if (!hosts.has(key))
                hosts.set(key, actorFor(db, tx, auth, row.owner_uid, row.profile_id));
            return hosts.get(key);
        };
        if (input.action === 'list') {
            const statuses = input.status ? [input.status] : ['live', 'scheduled'];
            const docs = await tx.get(db.collection('_space_authority').where('status', 'in', statuses).orderBy('created_at', 'desc').limit(50));
            const visible = await Promise.all(docs.docs.map(async (doc) => {
                const row = doc.data();
                if (!validRoomProof(row, doc.id))
                    return null;
                try {
                    const host = await roomHost(row);
                    return owns(row, host) ? roomView({ ...row, profile: profileView(host) }) : null;
                }
                catch (error) {
                    if (['failed-precondition', 'permission-denied', 'unauthenticated'].includes(error.code || ''))
                        return null;
                    throw error;
                }
            }));
            return { ...base, spaces: visible.filter(room => room !== null) };
        }
        const receiptRef = typeof input.requestId === 'string' ? db.doc(`_space_receipts/${digest([uid, actor.created, actor.binding, input.requestId])}`) : null;
        const receipt = receiptRef ? (await tx.get(receiptRef)).data() : null;
        if (receipt) {
            if (receipt.fingerprint !== fingerprint)
                throw new HttpsError('already-exists', 'This room change was already used.');
            return receipt.response;
        }
        const id = input.action === 'create' ? digest(['space-v1', uid, actor.binding, input.requestId]) : input.spaceId;
        const roomRef = db.doc(`_space_authority/${id}`), stored = (await tx.get(roomRef)).data();
        const memberRef = db.doc(`_space_members/${spaceMemberId(id, uid)}`), member = (await tx.get(memberRef)).data();
        const stamp = new Date(now).toISOString();
        const saveReceipt = (response) => { if (receiptRef)
            tx.create(receiptRef, { version: 1, fingerprint, response, created_at: stamp }); return response; };
        if (input.action === 'create') {
            if (stored)
                throw fail();
            if (input.scheduledAt && Date.parse(input.scheduledAt) <= now)
                throw new HttpsError('invalid-argument', 'Choose a future start time.');
            const ownership = { owner_uid: uid, profile_id: actor.profileId, binding: actor.binding, auth_created_at_ms: actor.created, profile: profileView(actor) };
            const room = { version: 1, id, ...ownership, title: input.title.trim(), description: input.description ?? null,
                tags: input.tags ?? [], status: input.scheduledAt ? 'scheduled' : 'live', scheduled_at: input.scheduledAt ?? null,
                started_at: input.scheduledAt ? null : stamp, ended_at: null, created_at: stamp, max_speakers: 10, allow_requests: true,
                listener_count: 0, peak_listeners: 0, participant_count: 1, speaker_count: 1, revision: 1 };
            const host = { version: 1, id: memberRef.id, space_id: id, ...ownership, role: 'host', is_muted: true,
                raised_hand: false, joined_at: stamp, left_at: null, revision: 1 };
            tx.create(roomRef, room);
            tx.create(memberRef, host);
            tx.create(db.doc(`spaces/${id}`), roomView(room));
            tx.create(db.doc(`space_participants/${host.id}`), memberView(host));
            return saveReceipt({ ...base, space: roomView(room), participant: memberView(host) });
        }
        if (!stored || !validRoomProof(stored, id))
            throw new HttpsError('not-found', 'This room could not be loaded.');
        const currentHost = await roomHost(stored);
        if (!owns(stored, currentHost))
            throw fail();
        stored.profile = profileView(currentHost);
        if (member && !validMemberProof(member, id))
            throw fail();
        if (input.action === 'read') {
            const participants = await tx.get(db.collection('_space_members').where('space_id', '==', id).where('left_at', '==', null).orderBy('joined_at').limit(200));
            const visible = await Promise.all(participants.docs.map(async (doc) => {
                const row = doc.data();
                if (!validMemberProof(row, id) || row.id !== doc.id)
                    return null;
                try {
                    const who = await roomHost(row);
                    return owns(row, who) ? memberView({ ...row, profile: profileView(who) }) : null;
                }
                catch (error) {
                    if (['failed-precondition', 'permission-denied', 'unauthenticated'].includes(error.code || ''))
                        return null;
                    throw error;
                }
            }));
            return { ...base, space: roomView(stored), participants: visible.filter(participant => participant !== null),
                participant: owns(member, actor) ? memberView({ ...member, profile: profileView(actor) }) : null };
        }
        if (stored.status !== 'live' && input.action !== 'end')
            throw fail();
        if (input.action === 'audio') {
            if (!member || member.version !== 1 || !owns(member, actor) || member.left_at !== null)
                throw denied();
            return { ...base, roomName: `space_v1_${digest([id, stored.binding, stored.created_at])}`, identity: actor.profileId,
                displayName: actor.row.display_name || actor.row.username || 'User', role: member.role, canPublish: speaker(member.role) };
        }
        const nextRoom = { ...stored };
        let targetRef = memberRef, target = member;
        if (input.action === 'role') {
            if (!owns(stored, actor))
                throw denied();
            targetRef = db.doc(`_space_members/${input.participantId}`);
            target = (await tx.get(targetRef)).data();
            if (!target || !validMemberProof(target, id) || target.id !== targetRef.id
                || target.space_id !== id || target.left_at !== null || target.role === 'host')
                throw denied();
            // A role cannot be assigned to a replacement account/profile incarnation.
            const targetActor = await actorFor(db, tx, auth, target.owner_uid, target.profile_id);
            if (!owns(target, targetActor))
                throw fail();
        }
        if (input.action === 'end') {
            if (!owns(stored, actor))
                throw denied();
            if (input.revision !== stored.revision)
                throw fail();
            nextRoom.status = 'ended';
            nextRoom.ended_at = stamp;
            nextRoom.revision = Number(stored.revision) + 1;
            nextRoom.listener_count = 0;
            nextRoom.participant_count = 0;
            nextRoom.speaker_count = 0;
            tx.set(roomRef, nextRoom);
            tx.set(db.doc(`spaces/${id}`), roomView(nextRoom));
            return saveReceipt({ ...base, space: roomView(nextRoom) });
        }
        if (target && ((input.action !== 'role' && !owns(target, actor))
            || target.version !== 1 || target.space_id !== id))
            throw fail();
        if (Number(target?.revision ?? 0) !== input.revision)
            throw fail();
        let next;
        if (input.action === 'join') {
            if (target?.left_at === null)
                return saveReceipt({ ...base, space: roomView(stored), participant: memberView(target) });
            if (Number(stored.participant_count) >= 200)
                throw new HttpsError('resource-exhausted', 'This room is full.');
            const role = owns(stored, actor) ? 'host' : (input.role ?? 'listener');
            if (role === 'requested' && !stored.allow_requests)
                throw denied();
            if (speaker(role) && Number(stored.speaker_count) >= Number(stored.max_speakers))
                throw new HttpsError('resource-exhausted', 'All speaker places are taken.');
            next = { version: 1, id: memberRef.id, space_id: id, owner_uid: uid, profile_id: actor.profileId, binding: actor.binding,
                auth_created_at_ms: actor.created, profile: profileView(actor), role, is_muted: true, raised_hand: role === 'requested', joined_at: stamp, left_at: null,
                revision: Number(target?.revision ?? 0) + 1 };
            nextRoom.participant_count = Number(stored.participant_count) + 1;
            if (role !== 'host')
                nextRoom.listener_count = Number(stored.listener_count) + 1;
            if (speaker(role))
                nextRoom.speaker_count = Number(stored.speaker_count) + 1;
            nextRoom.peak_listeners = Math.max(Number(stored.peak_listeners), Number(nextRoom.listener_count));
        }
        else {
            if (!target || target.left_at !== null)
                throw fail();
            next = { ...target, revision: Number(target.revision) + 1 };
            if (input.action === 'leave') {
                next.left_at = stamp;
                next.is_muted = true;
                next.raised_hand = false;
                nextRoom.participant_count = Math.max(0, Number(stored.participant_count) - 1);
                if (target.role !== 'host')
                    nextRoom.listener_count = Math.max(0, Number(stored.listener_count) - 1);
                if (speaker(target.role))
                    nextRoom.speaker_count = Math.max(0, Number(stored.speaker_count) - 1);
            }
            else if (input.action === 'mute') {
                if (input.isMuted === false && !speaker(target.role))
                    throw denied();
                next.is_muted = input.isMuted;
            }
            else if (input.action === 'hand') {
                if (!['listener', 'requested'].includes(String(target.role)) || !stored.allow_requests)
                    throw denied();
                next.role = input.raised ? 'requested' : 'listener';
                next.raised_hand = input.raised;
            }
            else if (input.action === 'role') {
                const change = Number(speaker(input.role)) - Number(speaker(target.role));
                if (Number(stored.speaker_count) + change > Number(stored.max_speakers))
                    throw new HttpsError('resource-exhausted', 'All speaker places are taken.');
                next.role = input.role;
                next.raised_hand = false;
                next.is_muted = true;
                nextRoom.speaker_count = Number(stored.speaker_count) + change;
            }
        }
        tx.set(targetRef, next);
        tx.set(db.doc(`space_participants/${next.id}`), memberView(next));
        tx.set(roomRef, nextRoom);
        tx.set(db.doc(`spaces/${id}`), roomView(nextRoom));
        return saveReceipt({ ...base, space: roomView(nextRoom), participant: memberView(next) });
    });
}
//# sourceMappingURL=spaceAuthority.js.map