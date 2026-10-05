import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { authorAdmission } from './socialFeedAuthority.js';
import { validPublicationMediaUrl } from './postPublicationProof.js';
const COLLECTIONS = { place: 'map_places', meetup: 'map_meetups', checkIn: 'map_check_ins', placePost: 'map_place_posts', comment: 'map_place_post_comments' };
const SCOPES = { places: 'place', meetups: 'meetup', checkIns: 'checkIn', placePosts: 'placePost', comments: 'comment' };
const ACTION_FIELDS = {
    list: ['scope', 'targetId', 'cursor'], read: ['kind', 'targetId'],
    createPlace: ['requestId', 'name', 'category', 'description', 'photoUrl', 'latitude', 'longitude'],
    publishPlace: ['requestId', 'targetId', 'expectedRevision'], publishMeetup: ['requestId', 'targetId', 'expectedRevision'],
    checkIn: ['requestId', 'placeId', 'message'], createPlacePost: ['requestId', 'placeId', 'content'], createComment: ['requestId', 'postId', 'content'],
    createMeetup: ['requestId', 'title', 'description', 'latitude', 'longitude', 'destLabel'],
    joinMeetup: ['requestId', 'meetupId', 'expectedRevision'], leaveMeetup: ['requestId', 'meetupId', 'expectedRevision'],
};
const CATEGORIES = ['hangout', 'food', 'view', 'study', 'party', 'chill'];
const LEASE_MS = 15000, CURSOR_MS = 600000, PAGE_SIZE = 20;
const revision = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const id = (value) => validAudienceId(value) && value !== '.' && value !== '..';
const cursorDocumentId = (value) => typeof value === 'string' && !!value && !value.includes('/') && value !== '.' && value !== '..' && Buffer.byteLength(value) <= 1500;
const cursorValue = (value) => value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string' || value instanceof Timestamp;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;
export const mapSocialHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const mapSocialMembershipId = (uid, meetupId) => mapSocialHash(['membership', uid, meetupId]);
const fail = (message = 'Map details are invalid.') => { throw new HttpsError('invalid-argument', message); };
const unavailable = () => { throw new HttpsError('permission-denied', 'This map item is no longer available to you. Refresh the map.'); };
function text(value, max, required = false) {
    if (value == null && !required)
        return null;
    if (typeof value !== 'string' || value.length > max || value.trim() !== value || (required && !value)
        || [...value].some(char => char.charCodeAt(0) < 32 && char !== '\n' && char !== '\r' && char !== '\t'))
        return fail();
    return value || null;
}
function geo(latitude, longitude) {
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90
        || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180)
        fail('Choose a valid map location.');
    return { latitude: latitude, longitude: longitude };
}
function date(value) { if (typeof value !== 'string' || value.length > 32 || !Number.isFinite(Date.parse(value)))
    fail(); return value; }
function count(value) { if (!Number.isSafeInteger(value) || value < 0 || value > 10000000)
    fail(); return value; }
function url(value) { if (value == null || value === '')
    return null; if (!validPublicationMediaUrl(value))
    fail('Choose a supported image URL.'); return value; }
function summary(owner) {
    const safeText = (value, max) => typeof value === 'string' && value.length <= max ? value : null;
    return { id: owner.profileId, username: safeText(owner.row.username, 80), display_name: safeText(owner.row.display_name, 120),
        avatar_url: typeof owner.row.avatar_url === 'string' && owner.row.avatar_url.startsWith('https://') && validPublicationMediaUrl(owner.row.avatar_url) ? owner.row.avatar_url : null };
}
function ownerAlias(kind, row) { return row[kind === 'place' ? 'created_by' : kind === 'meetup' ? 'host_id' : 'user_id']; }
export function validMapSocialPublication(kind, resourceId, row, proof, owner) {
    return proof?.version === 1 && proof.kind === kind && proof.resource_id === resourceId && proof.owner_uid === owner.uid
        && proof.profile_id === owner.profileId && proof.status === 'published' && revision(proof.revision)
        && proof.source_fingerprint === mapSocialHash(row) && owner.aliases.includes(String(ownerAlias(kind, row)));
}
function legacyRevision(kind, snap) {
    return mapSocialHash(['legacy', kind, snap.id, snap.data(),
        snap.createTime && [snap.createTime.seconds, snap.createTime.nanoseconds], snap.updateTime && [snap.updateTime.seconds, snap.updateTime.nanoseconds]]).slice(0, 48);
}
function baseRow(kind, row, owner, legacy = false) {
    if (row.deleted_at || row.is_deleted || row.is_hidden || row.is_removed || (row.status !== undefined && !['active', 'published'].includes(String(row.status))))
        fail();
    const common = { created_at: date(row.created_at), visibility: 'friends', ...((kind === 'place' || kind === 'meetup') ? {} : { user_id: owner.profileId }) };
    if (kind === 'place') {
        if (typeof row.category !== 'string' || !CATEGORIES.includes(row.category))
            fail();
        return { ...common, created_by: owner.profileId, name: text(row.name, 80, true), category: row.category, description: text(row.description, 280),
            photo_url: url(row.photo_url), ...geo(row.latitude, row.longitude), check_in_count: legacy ? 0 : count(row.check_in_count), story_count: 0, vibe_tags: [row.category] };
    }
    if (kind === 'meetup')
        return { ...common, host_id: owner.profileId, title: text(row.title, 80, true), description: text(row.description, 280),
            dest_latitude: geo(row.dest_latitude, row.dest_longitude).latitude, dest_longitude: row.dest_longitude, dest_label: text(row.dest_label, 80),
            status: 'active', starts_at: date(row.starts_at), member_count: legacy ? 0 : count(row.member_count) };
    if (kind === 'checkIn') {
        if (!id(row.place_id))
            fail();
        return { ...common, place_id: row.place_id, place_name: text(row.place_name, 80, true), message: text(row.message, 280), ...geo(row.latitude, row.longitude) };
    }
    if (kind === 'placePost') {
        if (!id(row.place_id))
            fail();
        return { ...common, place_id: row.place_id, content: text(row.content, 280, true), media_url: null, like_count: 0, comment_count: count(row.comment_count) };
    }
    if (!id(row.post_id))
        fail();
    return { ...common, post_id: row.post_id, content: text(row.content, 200, true) };
}
async function bindingAllows(database, tx, owner) {
    const binding = (await tx.get(database.doc(`_account_profile_bindings/${owner.uid}`))).data();
    return !binding || (binding.version === 1 && binding.owner_uid === owner.uid && binding.profile_id === owner.profileId && binding.status === 'active' && revision(binding.revision));
}
async function actorFor(database, tx, uid, profileId) {
    const actor = await resolveIdentity(database, tx, uid);
    if (!actor || actor.uid !== uid || actor.profileId !== profileId || !(await bindingAllows(database, tx, actor)))
        throw new HttpsError('failed-precondition', 'Your profile changed. Reopen the map.');
    return actor;
}
async function checkInCandidateProfiles(ctx) {
    const { tx, database, actor } = ctx;
    const [outgoing, incoming] = await Promise.all([
        tx.get(database.collection('friend_requests').where('sender_id', 'in', actor.aliases).where('status', '==', 'accepted').limit(501)),
        tx.get(database.collection('friend_requests').where('receiver_id', 'in', actor.aliases).where('status', '==', 'accepted').limit(501)),
    ]);
    if (outgoing.size > 500 || incoming.size > 500)
        throw new HttpsError('resource-exhausted', 'Your friend check-ins need a larger supported window. Other map items remain available.');
    const aliases = [...new Set([...outgoing.docs.map(snap => snap.data().receiver_id), ...incoming.docs.map(snap => snap.data().sender_id)])].filter(id);
    if (aliases.length > 500)
        throw new HttpsError('resource-exhausted', 'Your friend check-ins need a larger supported window. Other map items remain available.');
    // Relationship aliases are only query candidates. An alias can be a migrated
    // Auth UID, so include its current profile candidates without trusting any
    // candidate ownership/index as admission. Each returned item is checked below.
    const candidates = new Set([actor.profileId, ...aliases]);
    for (let start = 0; start < aliases.length; start += 30) {
        const matches = await tx.get(database.collection('profiles').where('user_id', 'in', aliases.slice(start, start + 30)).limit(61));
        if (matches.size > 60)
            throw new HttpsError('failed-precondition', 'Friend profile identities need review. Refresh your friends list.');
        for (const match of matches.docs)
            if (id(match.id))
                candidates.add(match.id);
    }
    return [...candidates].sort();
}
async function admission(ctx, alias) {
    if (!ctx.admissions.has(alias))
        ctx.admissions.set(alias, authorAdmission(ctx.database, ctx.tx, ctx.actor, alias));
    const result = await ctx.admissions.get(alias);
    return result && await bindingAllows(ctx.database, ctx.tx, result.author) ? result : null;
}
async function membership(ctx, meetupId) {
    const value = (await ctx.tx.get(ctx.database.doc(`_map_social_memberships/${mapSocialMembershipId(ctx.actor.uid, meetupId)}`))).data();
    if (!value)
        return null;
    if (value.version !== 1 || value.owner_uid !== ctx.actor.uid || value.profile_id !== ctx.actor.profileId || value.meetup_id !== meetupId
        || !['going', 'left'].includes(value.status) || !revision(value.revision))
        throw new HttpsError('failed-precondition', 'Your meetup membership needs review.');
    return { status: value.status, revision: value.revision };
}
async function admit(ctx, kind, resourceId, supplied) {
    if (!id(resourceId))
        return null;
    const key = `${kind}:${resourceId}`;
    if (!ctx.items.has(key))
        ctx.items.set(key, (async () => {
            const snap = supplied ?? await ctx.tx.get(ctx.database.doc(`${COLLECTIONS[kind]}/${resourceId}`));
            const row = snap.data(), alias = row && ownerAlias(kind, row);
            if (!row || !id(alias))
                return null;
            const allowed = await admission(ctx, alias);
            if (!allowed)
                return null;
            const { author: owner } = allowed;
            const proof = (await ctx.tx.get(ctx.database.doc(`_map_social_publications/${key}`))).data();
            const published = validMapSocialPublication(kind, resourceId, row, proof, owner);
            // A malformed/revoked protected proof can never be downgraded to recoverable
            // legacy. Only a genuinely unproven place/meetup has the explicit review UI.
            const legacy = !proof && !published && owner.uid === ctx.actor.uid && (kind === 'place' || kind === 'meetup');
            if (!published && !legacy)
                return null;
            if (published && (!allowed.allows('friends') || !allowed.allows(allowed.settings.location)))
                return null;
            if (kind === 'placePost' || kind === 'comment') {
                if (!allowed.allows(allowed.settings.posts))
                    return null;
                const parentKind = kind === 'placePost' ? 'place' : 'placePost';
                const parentId = row[kind === 'placePost' ? 'place_id' : 'post_id'];
                if (!id(parentId))
                    return null;
                const parent = await admit(ctx, parentKind, parentId);
                if (!parent || parent.legacy)
                    return null;
            }
            if (kind === 'checkIn') {
                if (!id(row.place_id))
                    return null;
                const parent = await admit(ctx, 'place', row.place_id);
                if (!parent || parent.legacy)
                    return null;
            }
            let projected;
            try {
                projected = baseRow(kind, row, owner, legacy);
            }
            catch {
                return null;
            }
            const itemRevision = legacy ? legacyRevision(kind, snap) : proof.revision;
            const dto = { ...projected, id: resourceId, revision: itemRevision, legacy, profile: summary(owner) };
            if (kind === 'meetup')
                dto.membership = legacy ? null : await membership(ctx, resourceId);
            return { kind, id: resourceId, row, dto, owner, legacy, revision: itemRevision };
        })());
    return ctx.items.get(key);
}
function normalize(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        fail();
    const input = raw;
    if (input.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen the map.');
    if (!id(input.expectedProfileId) || typeof input.action !== 'string' || !Object.hasOwn(ACTION_FIELDS, input.action)
        || Object.keys(input).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', ...ACTION_FIELDS[String(input.action)]].includes(key)))
        fail();
    if (input.action === 'list') {
        if (typeof input.scope !== 'string' || !Object.hasOwn(SCOPES, input.scope)
            || (['placePosts', 'comments'].includes(input.scope) ? !id(input.targetId) : input.targetId !== undefined)
            || (input.cursor !== undefined && !revision(input.cursor)))
            fail();
    }
    else if (input.action === 'read') {
        if (!['place', 'meetup'].includes(String(input.kind)) || !id(input.targetId))
            fail();
    }
    else {
        if (typeof input.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId))
            fail('A stable map request identity is required.');
        if (['joinMeetup', 'leaveMeetup'].includes(String(input.action)) && (!id(input.meetupId) || (input.expectedRevision !== null && !revision(input.expectedRevision))))
            fail();
        if (['publishPlace', 'publishMeetup'].includes(String(input.action)) && (!id(input.targetId) || !revision(input.expectedRevision)))
            fail();
        if (['checkIn', 'createPlacePost'].includes(String(input.action)) && !id(input.placeId))
            fail();
        if (input.action === 'createComment' && !id(input.postId))
            fail();
        if (input.action === 'createPlace') {
            text(input.name, 80, true);
            text(input.description, 280);
            url(input.photoUrl);
            geo(input.latitude, input.longitude);
            if (!CATEGORIES.includes(String(input.category)))
                fail();
        }
        if (input.action === 'createMeetup') {
            text(input.title, 80, true);
            text(input.description, 280);
            text(input.destLabel, 80);
            geo(input.latitude, input.longitude);
        }
        if (input.action === 'checkIn')
            text(input.message, 280);
        if (input.action === 'createPlacePost' || input.action === 'createComment')
            text(input.content, input.action === 'createComment' ? 200 : 280, true);
    }
    return input;
}
function publish(ctx, kind, resourceId, row, owner = ctx.actor, nextRevision = randomBytes(24).toString('hex')) {
    ctx.tx.set(ctx.database.doc(`${COLLECTIONS[kind]}/${resourceId}`), row);
    ctx.tx.set(ctx.database.doc(`_map_social_publications/${kind}:${resourceId}`), { version: 1, kind, resource_id: resourceId, owner_uid: owner.uid,
        profile_id: owner.profileId, status: 'published', revision: nextRevision, source_fingerprint: mapSocialHash(row) });
    return nextRevision;
}
function response(ctx, now) { return { ok: true, ownerUid: ctx.actor.uid, profileId: ctx.actor.profileId, serverTime: now, validUntil: now + LEASE_MS }; }
function currentStatus(item, action) {
    if (!item || item.legacy)
        return 'unavailable';
    if (action === 'joinMeetup' || action === 'leaveMeetup')
        return item.dto.membership?.status ?? 'left';
    return 'active';
}
/** Area research may use a caller's explicit draft location, or the current
 * admitted place's exact source. A caller-selected ID is never write authority. */
export async function resolveMapIntelTarget(database, uid, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        fail();
    const input = raw;
    if (input.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen this location.');
    if (!id(input.expectedProfileId) || Object.keys(input).some(key => !['expectedOwnerUid', 'expectedProfileId', 'latitude', 'longitude', 'placeName', 'placeId', 'forceRefresh'].includes(key))
        || (input.placeId !== undefined && !id(input.placeId)) || (input.forceRefresh !== undefined && typeof input.forceRefresh !== 'boolean'))
        fail();
    return database.runTransaction(async (tx) => {
        const actor = await actorFor(database, tx, uid, input.expectedProfileId);
        if (input.placeId) {
            const ctx = { database, tx, actor, admissions: new Map(), items: new Map() };
            const item = await admit(ctx, 'place', input.placeId);
            if (!item || item.legacy)
                unavailable();
            return { ownerUid: uid, profileId: actor.profileId, placeId: input.placeId, revision: item.revision,
                latitude: item.dto.latitude, longitude: item.dto.longitude, placeName: item.dto.name };
        }
        return { ownerUid: uid, profileId: actor.profileId, placeId: null, revision: null, ...geo(input.latitude, input.longitude), placeName: text(input.placeName, 80) };
    });
}
/** Every read and dependent write shares one current transaction. No legacy
 * caller-writable row, cache, stored receipt or membership grants admission. */
export async function runManageMapSocial(database, uid, raw, now = Date.now()) {
    const input = normalize(raw, uid), action = input.action;
    const requestId = input.requestId, newId = randomUUID(), nextRevision = randomBytes(24).toString('hex');
    return database.runTransaction(async (tx) => {
        const actor = await actorFor(database, tx, uid, input.expectedProfileId);
        const ctx = { database, tx, actor, admissions: new Map(), items: new Map() };
        const base = response(ctx, now);
        if (action === 'read') {
            const item = await admit(ctx, input.kind, input.targetId);
            return { ...base, action, kind: input.kind, targetId: input.targetId, item: item?.dto ?? null };
        }
        if (action === 'list') {
            const scope = input.scope, kind = SCOPES[scope], targetId = input.targetId ?? null;
            let upper = new Date(now).toISOString(), last = null;
            const friendProfiles = scope === 'checkIns' ? await checkInCandidateProfiles(ctx) : null;
            const friendScope = friendProfiles ? mapSocialHash(friendProfiles) : null;
            if (input.cursor) {
                const cursor = (await tx.get(database.doc(`_map_social_cursors/${input.cursor}`))).data();
                if (!cursor || cursor.version !== 1 || cursor.owner_uid !== uid || cursor.profile_id !== actor.profileId || cursor.scope !== scope || cursor.target_id !== targetId
                    || !(cursor.expireAt instanceof Timestamp) || cursor.expireAt.toMillis() <= now || !cursorDocumentId(cursor.document_id) || typeof cursor.upper !== 'string'
                    || cursor.friend_scope !== friendScope || !Object.hasOwn(cursor, 'created_at') || !cursorValue(cursor.created_at))
                    throw new HttpsError('failed-precondition', 'This map page expired or your friends changed. Refresh the map.');
                upper = cursor.upper;
                last = { created_at: cursor.created_at, document_id: cursor.document_id };
            }
            const empty = { ...base, action, scope, targetId, items: [], nextCursor: null };
            if (scope === 'placePosts' || scope === 'comments') {
                const parent = await admit(ctx, scope === 'placePosts' ? 'place' : 'placePost', targetId);
                if (!parent || parent.legacy)
                    return empty;
            }
            const direction = scope === 'comments' ? 'asc' : 'desc';
            let query = database.collection(COLLECTIONS[kind]).where('created_at', '<=', upper).orderBy('created_at', direction).orderBy(FieldPath.documentId(), direction);
            if (scope === 'placePosts')
                query = query.where('place_id', '==', targetId);
            if (scope === 'comments')
                query = query.where('post_id', '==', targetId);
            if (scope === 'meetups')
                query = query.where('status', '==', 'active');
            if (scope === 'checkIns')
                query = query.where('created_at', '>=', new Date(Date.parse(upper) - 86400000).toISOString());
            if (last)
                query = query.startAfter(last.created_at, last.document_id);
            const pages = friendProfiles ? await Promise.all(Array.from({ length: Math.ceil(friendProfiles.length / 30) }, (_, chunk) => tx.get(query.where('user_id', 'in', friendProfiles.slice(chunk * 30, (chunk + 1) * 30)).limit(PAGE_SIZE + 1)))) : [await tx.get(query.limit(PAGE_SIZE + 1))];
            const candidates = pages.flatMap(page => page.docs);
            if (friendProfiles)
                candidates.sort((a, b) => Buffer.compare(Buffer.from(String(b.data().created_at)), Buffer.from(String(a.data().created_at))) || Buffer.compare(Buffer.from(b.id), Buffer.from(a.id)));
            for (const snap of candidates.slice(0, PAGE_SIZE)) {
                const item = await admit(ctx, kind, snap.id, snap);
                if (item)
                    empty.items.push(item.dto);
            }
            if (candidates.length > PAGE_SIZE) {
                const end = candidates[PAGE_SIZE - 1], cursorId = randomBytes(24).toString('hex');
                tx.create(database.doc(`_map_social_cursors/${cursorId}`), { version: 1, owner_uid: uid, profile_id: actor.profileId, scope, target_id: targetId,
                    document_id: end.id, created_at: end.data().created_at, upper, friend_scope: friendScope, expireAt: Timestamp.fromMillis(now + CURSOR_MS) });
                empty.nextCursor = cursorId;
            }
            return empty;
        }
        const receiptRef = database.doc(`_map_social_receipts/${mapSocialHash([uid, requestId])}`);
        const fingerprint = mapSocialHash(input), prior = (await tx.get(receiptRef)).data();
        if (prior) {
            if (prior.version !== 1 || prior.owner_uid !== uid || prior.profile_id !== actor.profileId || prior.fingerprint !== fingerprint || prior.action !== action
                || !id(prior.resource_id) || !Object.hasOwn(COLLECTIONS, prior.kind))
                throw new HttpsError('already-exists', 'This map request was already used. Retry the original request.');
            const item = await admit(ctx, prior.kind, prior.resource_id);
            const currentMember = action === 'leaveMeetup' && !item ? await membership(ctx, prior.resource_id) : null;
            return { ...base, action, requestId, resourceId: prior.resource_id,
                status: currentMember?.status === 'left' ? 'left' : currentStatus(item, action), item: item?.dto ?? null };
        }
        const createdAt = new Date(now).toISOString();
        let kind, resourceId, row, itemOwner = actor, itemMembership = null;
        if (action === 'createPlace') {
            kind = 'place';
            resourceId = newId;
            row = { created_by: actor.profileId, name: input.name, category: input.category, description: input.description ?? null, photo_url: input.photoUrl ?? null,
                ...geo(input.latitude, input.longitude), check_in_count: 1, story_count: 0, vibe_tags: [input.category], visibility: 'friends', created_at: createdAt };
            const checkId = mapSocialHash([uid, requestId, 'initial-check-in']);
            publish(ctx, 'checkIn', checkId, { user_id: actor.profileId, place_id: resourceId, place_name: row.name, message: row.description,
                latitude: row.latitude, longitude: row.longitude, visibility: 'friends', created_at: createdAt });
        }
        else if (action === 'createMeetup') {
            kind = 'meetup';
            resourceId = newId;
            row = { host_id: actor.profileId, title: input.title, description: input.description ?? null, dest_latitude: input.latitude, dest_longitude: input.longitude,
                dest_label: input.destLabel ?? null, status: 'active', starts_at: createdAt, created_at: createdAt, visibility: 'friends', member_count: 1 };
            itemMembership = { status: 'going', revision: nextRevision };
            tx.create(database.doc(`_map_social_memberships/${mapSocialMembershipId(uid, resourceId)}`), { version: 1, owner_uid: uid, profile_id: actor.profileId,
                meetup_id: resourceId, ...itemMembership, updated_at: createdAt });
        }
        else if (action === 'publishPlace' || action === 'publishMeetup') {
            kind = action === 'publishPlace' ? 'place' : 'meetup';
            resourceId = input.targetId;
            const current = await admit(ctx, kind, resourceId);
            if (!current || current.owner.uid !== uid)
                unavailable();
            if (!current.legacy || current.revision !== input.expectedRevision)
                throw new HttpsError('aborted', 'This map item changed. Review it again before sharing.');
            row = { ...baseRow(kind, current.row, actor, true), created_at: current.row.created_at, visibility: 'friends' };
            if (kind === 'meetup') {
                const existingMember = await membership(ctx, resourceId);
                if (existingMember)
                    throw new HttpsError('failed-precondition', 'This meetup publication needs review.');
                row.member_count = 1;
                itemMembership = { status: 'going', revision: nextRevision };
                tx.create(database.doc(`_map_social_memberships/${mapSocialMembershipId(uid, resourceId)}`), { version: 1, owner_uid: uid, profile_id: actor.profileId,
                    meetup_id: resourceId, ...itemMembership, updated_at: createdAt });
            }
        }
        else if (action === 'joinMeetup' || action === 'leaveMeetup') {
            kind = 'meetup';
            resourceId = input.meetupId;
            const current = await admit(ctx, 'meetup', resourceId), existing = await membership(ctx, resourceId);
            if ((existing?.revision ?? null) !== input.expectedRevision)
                throw new HttpsError('aborted', 'Your RSVP changed. Refresh this meetup.');
            if ((!current || current.legacy) && action === 'leaveMeetup' && existing) {
                // A revoked audience cannot trap a user in their own membership. Do not
                // return source content or infer authority from that membership.
                const snap = await tx.get(database.doc(`map_meetups/${resourceId}`)), source = snap.data();
                const proof = (await tx.get(database.doc(`_map_social_publications/meetup:${resourceId}`))).data();
                const host = source && id(source.host_id) ? await resolveIdentity(database, tx, source.host_id) : null;
                if (host?.uid === uid)
                    throw new HttpsError('failed-precondition', 'The meetup host cannot leave their own meetup.');
                const validSource = source && host && await bindingAllows(database, tx, host) && validMapSocialPublication('meetup', resourceId, source, proof, host);
                if (validSource && existing.status === 'going')
                    publish(ctx, 'meetup', resourceId, { ...source, member_count: Math.max(0, count(source.member_count) - 1) }, host);
                tx.set(database.doc(`_map_social_memberships/${mapSocialMembershipId(uid, resourceId)}`), { version: 1, owner_uid: uid, profile_id: actor.profileId,
                    meetup_id: resourceId, status: 'left', revision: nextRevision, updated_at: createdAt });
                tx.create(receiptRef, { version: 1, owner_uid: uid, profile_id: actor.profileId, fingerprint, action, request_id: requestId,
                    kind, resource_id: resourceId, created_at: createdAt });
                return { ...base, action, requestId, resourceId, status: 'left', item: null };
            }
            if (!current || current.legacy)
                unavailable();
            if (current.owner.uid === uid && action === 'leaveMeetup')
                throw new HttpsError('failed-precondition', 'The meetup host cannot leave their own meetup.');
            const status = action === 'joinMeetup' ? 'going' : 'left';
            const delta = status === 'going' && existing?.status !== 'going' ? 1 : status === 'left' && existing?.status === 'going' ? -1 : 0;
            row = { ...current.row, member_count: count(current.row.member_count) + delta };
            count(row.member_count);
            itemOwner = current.owner;
            itemMembership = { status, revision: nextRevision };
            tx.set(database.doc(`_map_social_memberships/${mapSocialMembershipId(uid, resourceId)}`), { version: 1, owner_uid: uid, profile_id: actor.profileId,
                meetup_id: resourceId, ...itemMembership, updated_at: createdAt });
        }
        else {
            const parentKind = action === 'createComment' ? 'placePost' : 'place';
            const parentId = (action === 'createComment' ? input.postId : input.placeId);
            const parent = await admit(ctx, parentKind, parentId);
            if (!parent || parent.legacy)
                unavailable();
            resourceId = newId;
            if (action === 'checkIn') {
                kind = 'checkIn';
                row = { user_id: actor.profileId, place_id: parentId, place_name: parent.row.name,
                    latitude: parent.row.latitude, longitude: parent.row.longitude, message: input.message ?? null, visibility: 'friends', created_at: createdAt };
                publish(ctx, 'place', parentId, { ...parent.row, check_in_count: count(parent.row.check_in_count) + 1 }, parent.owner);
            }
            else if (action === 'createPlacePost') {
                kind = 'placePost';
                row = { user_id: actor.profileId, place_id: parentId, content: input.content, media_url: null, like_count: 0, comment_count: 0, visibility: 'friends', created_at: createdAt };
            }
            else {
                kind = 'comment';
                row = { user_id: actor.profileId, post_id: parentId, content: input.content, visibility: 'friends', created_at: createdAt };
                publish(ctx, 'placePost', parentId, { ...parent.row, comment_count: count(parent.row.comment_count) + 1 }, parent.owner);
            }
        }
        const itemRevision = publish(ctx, kind, resourceId, row, itemOwner, nextRevision);
        tx.create(receiptRef, { version: 1, owner_uid: uid, profile_id: actor.profileId, fingerprint, action, request_id: requestId,
            kind, resource_id: resourceId, created_at: createdAt });
        const dto = { ...baseRow(kind, row, itemOwner), id: resourceId, revision: itemRevision, legacy: false, profile: summary(itemOwner) };
        if (kind === 'meetup')
            dto.membership = itemMembership;
        return { ...base, action, requestId, resourceId, status: itemMembership && ['joinMeetup', 'leaveMeetup'].includes(action) ? itemMembership.status : 'active', item: dto };
    });
}
/** Existing meetup notification trigger, with current publication/admission and
 * a deterministic delivery receipt. Raw legacy rows cannot trigger a broadcast. */
export async function notifyMapMeetup(database, meetupId, now = Date.now()) {
    if (!id(meetupId))
        return { sent: 0 };
    const candidates = await database.runTransaction(async (tx) => {
        const proof = (await tx.get(database.doc(`_map_social_publications/meetup:${meetupId}`))).data();
        if (!proof || !id(proof.owner_uid) || !id(proof.profile_id))
            return [];
        const host = await actorFor(database, tx, proof.owner_uid, proof.profile_id);
        const ctx = { database, tx, actor: host, admissions: new Map(), items: new Map() };
        const meetup = await admit(ctx, 'meetup', meetupId);
        if (!meetup || meetup.legacy)
            return [];
        const [outgoing, incoming] = await Promise.all([
            tx.get(database.collection('friend_requests').where('sender_id', 'in', host.aliases).where('status', '==', 'accepted').limit(80)),
            tx.get(database.collection('friend_requests').where('receiver_id', 'in', host.aliases).where('status', '==', 'accepted').limit(80)),
        ]);
        return [...new Set([...outgoing.docs.map(snap => snap.data().receiver_id), ...incoming.docs.map(snap => snap.data().sender_id)])].filter(id).slice(0, 40);
    });
    let sent = 0;
    for (const alias of candidates) {
        const delivered = await database.runTransaction(async (tx) => {
            const viewer = await resolveIdentity(database, tx, alias);
            if (!viewer || !(await bindingAllows(database, tx, viewer)))
                return false;
            const ctx = { database, tx, actor: viewer, admissions: new Map(), items: new Map() };
            const meetup = await admit(ctx, 'meetup', meetupId);
            if (!meetup || meetup.legacy || meetup.owner.uid === viewer.uid)
                return false;
            const deliveryId = mapSocialHash(['meetup', meetupId, viewer.uid]);
            const delivery = database.doc(`_map_social_notifications/${deliveryId}`);
            if ((await tx.get(delivery)).exists)
                return false;
            tx.create(database.doc(`notifications/map-meetup-${deliveryId}`), { user_id: viewer.profileId, actor_id: meetup.owner.profileId, type: 'map_meetup',
                title: meetup.dto.profile && (meetup.dto.profile.display_name || meetup.dto.profile.username) || 'A friend',
                body: `started a meetup: ${meetup.dto.title}`, deep_link: '/map', meetup_id: meetupId, read: false, created_at: new Date(now).toISOString() });
            tx.create(delivery, { meetup_id: meetupId, owner_uid: meetup.owner.uid, recipient_uid: viewer.uid, publication_revision: meetup.revision, created_at: new Date(now).toISOString() });
            return true;
        });
        if (delivered)
            sent++;
    }
    return { sent };
}
//# sourceMappingURL=mapSocialAuthority.js.map