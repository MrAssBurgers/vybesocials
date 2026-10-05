import { createHash, randomBytes } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { authorAdmission, projectPost } from './socialFeedAuthority.js';
import { validPublicationPostId } from './postPublicationProof.js';
const PAGE = 20, LEASE = 15000, CURSOR_LIFE = 600000;
const FIELDS = { state: ['kind', 'sourceId'], read: ['pinId'], list: ['kind', 'cursor'], share: ['kind', 'sourceId', 'expectedRevision', 'expectedSourceRevision', 'area', 'requestId'], remove: ['kind', 'sourceId', 'expectedRevision', 'requestId'] };
const READS = new Set(['state', 'read', 'list']);
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => validAudienceId(value) && value !== '.' && value !== '..';
const revision = (value) => typeof value === 'string' && /^[a-f0-9]{48}$/.test(value);
const hashId = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const stamp = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const version = (value) => value ? `${value.seconds}:${value.nanoseconds}` : '';
const versionText = (value) => typeof value === 'string' && /^\d+:\d+$/.test(value);
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const mapPinHash = (value) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const mapPinId = (kind, sourceId, uid, created) => mapPinHash([kind, sourceId, uid, created]);
const freshRevision = () => randomBytes(24).toString('hex');
const invalid = () => { throw new HttpsError('invalid-argument', 'These map sharing details are invalid.'); };
const changed = () => { throw new HttpsError('failed-precondition', 'Your verified account changed. Reopen map sharing.'); };
const unavailable = () => { throw new HttpsError('permission-denied', 'This published content is no longer available for map sharing.'); };
const stale = () => { throw new HttpsError('aborted', 'Map sharing or this post changed. Review its current details before trying again.'); };
function label(value) { return typeof value === 'string' && !!value && value.trim() === value && value.length <= 120 && ![...value].some(char => char.charCodeAt(0) < 32); }
export function approximateMapPinArea(latitude, longitude) {
    const snap = (value, offset, cells) => Number((Math.min(cells - 1, Math.max(0, Math.floor((value + offset) / 0.02))) * 0.02 - offset + 0.01).toFixed(2));
    return { latitude: snap(latitude, 90, 9000), longitude: snap(longitude, 180, 18000) };
}
function normalize(raw, uid) {
    if (!object(raw) || raw.expectedOwnerUid !== uid)
        return changed();
    const fields = typeof raw.action === 'string' && Object.hasOwn(FIELDS, raw.action) ? FIELDS[raw.action] : undefined;
    if (!fields)
        return invalid();
    if (!id(raw.expectedProfileId) || !stamp(raw.expectedAccountCreatedAt)
        || Object.keys(raw).some(key => !['action', 'expectedOwnerUid', 'expectedProfileId', 'expectedAccountCreatedAt', ...fields].includes(key)))
        invalid();
    if (fields.includes('kind') && !['post', 'clip'].includes(String(raw.kind)))
        invalid();
    if (fields.includes('sourceId') && !validPublicationPostId(raw.sourceId))
        invalid();
    if (raw.action === 'read' && !hashId(raw.pinId))
        invalid();
    if (raw.action === 'list' && raw.cursor !== undefined && raw.cursor !== null && !revision(raw.cursor))
        invalid();
    if (!READS.has(String(raw.action)) && !uuid(raw.requestId))
        invalid();
    if (raw.action === 'share') {
        if (raw.expectedRevision !== null && !revision(raw.expectedRevision))
            invalid();
        if (!revision(raw.expectedSourceRevision) || !object(raw.area) || Object.keys(raw.area).some(key => !['latitude', 'longitude', 'label'].includes(key))
            || !finite(raw.area.latitude, -90, 90) || !finite(raw.area.longitude, -180, 180) || !label(raw.area.label))
            invalid();
    }
    if (raw.action === 'remove' && !revision(raw.expectedRevision))
        invalid();
    return raw;
}
async function authCurrent(auth, who, required) {
    let user;
    try {
        user = await auth.getUser(who.uid);
    }
    catch (error) {
        if (error?.code === 'auth/user-not-found') {
            if (required)
                changed();
            return false;
        }
        throw new HttpsError('unavailable', 'Account ownership could not be checked. Please retry.');
    }
    const valid = user.uid === who.uid && !user.disabled && Date.parse(user.metadata.creationTime) === who.created;
    if (!valid && required)
        changed();
    return valid;
}
async function identity(ctx, alias, resolved) {
    if (!ctx.identities.has(alias))
        ctx.identities.set(alias, (async () => {
            const who = resolved ?? await resolveIdentity(ctx.db, ctx.tx, alias);
            if (!who)
                return null;
            const binding = (await ctx.tx.get(ctx.db.doc(`_account_profile_bindings/${who.uid}`))).data();
            if (binding?.version !== 1 || binding.status !== 'active' || binding.owner_uid !== who.uid || binding.profile_id !== who.profileId || !stamp(binding.auth_created_at_ms) || !revision(binding.revision))
                return null;
            const result = { ...who, created: binding.auth_created_at_ms, binding: binding.revision };
            return await authCurrent(ctx.auth, result, false) ? result : null;
        })());
    return ctx.identities.get(alias);
}
async function finalAuth(ctx) {
    await authCurrent(ctx.auth, ctx.actor, true);
    await Promise.all([...ctx.owners.values()].filter(who => who.uid !== ctx.actor.uid).map(async (who) => { if (!await authCurrent(ctx.auth, who, false))
        unavailable(); }));
}
async function sourceFor(ctx, kind, sourceId) {
    const [source, proof] = await ctx.tx.getAll(ctx.db.doc(`posts/${sourceId}`), ctx.db.doc(`_post_publications/${sourceId}`));
    if (!source.exists || !proof.exists || !source.createTime || !proof.createTime)
        return null;
    const row = source.data();
    if (!validAudienceId(row.author_id))
        return null;
    // Reuse the exact helpers used by admitSocialPost, with one current author
    // admission per author/page for both content and location policy.
    if (!ctx.admissions.has(row.author_id))
        ctx.admissions.set(row.author_id, authorAdmission(ctx.db, ctx.tx, ctx.actor, row.author_id));
    const admission = await ctx.admissions.get(row.author_id);
    if (!admission || (row.user_id !== undefined && !admission.author.aliases.includes(row.user_id)) || !admission.allows(admission.settings.location))
        return null;
    const post = projectPost(sourceId, row, admission, proof.data(), ctx.actor.uid);
    if (!post || post.needsOwnerConfirmation || (kind === 'clip' ? post.type !== 'short' : !['post', 'video'].includes(post.type)))
        return null;
    const owner = await identity(ctx, admission.author.profileId, admission.author);
    if (!owner || owner.profileId !== post.author.id)
        return null;
    ctx.owners.set(owner.uid, owner);
    const sourceTime = version(source.createTime), proofTime = version(proof.createTime);
    return { post, owner, sourceTime, proofTime, revision: mapPinHash([sourceTime, proofTime, post.publicationRevision]).slice(0, 48) };
}
async function ownedSourceFor(ctx, kind, sourceId) {
    const row = (await ctx.tx.get(ctx.db.doc(`posts/${sourceId}`))).data();
    if (!row || !ctx.actor.aliases.includes(row.author_id) || (row.user_id !== undefined && !ctx.actor.aliases.includes(row.user_id)))
        return null;
    return sourceFor(ctx, kind, sourceId);
}
async function stateFrom(ctx, snapshot) {
    const row = snapshot.data();
    if (!row)
        return null;
    if (row.version !== 1 || row.id !== snapshot.id || !hashId(row.id) || !['post', 'clip'].includes(row.kind) || !validPublicationPostId(row.source_id)
        || !id(row.owner_uid) || !id(row.profile_id) || !stamp(row.account_created_at_ms) || !revision(row.binding_revision) || !revision(row.revision) || !revision(row.generation)
        || !['shared', 'removed'].includes(row.status) || !hashId(row.creation_receipt_id) || !hashId(row.last_receipt_id)
        || !versionText(row.source_create_time) || !versionText(row.proof_create_time) || !finite(row.latitude, -89.99, 89.99) || !finite(row.longitude, -179.99, 179.99)
        || !label(row.area_label) || typeof row.shared_at !== 'string' || !Number.isFinite(Date.parse(row.shared_at))
        || row.id !== mapPinId(row.kind, row.source_id, row.owner_uid, row.account_created_at_ms))
        return null;
    const origin = await ctx.tx.get(ctx.db.doc(`_map_pin_receipts/${row.creation_receipt_id}`)), original = origin.data();
    if (!snapshot.createTime || !origin.createTime || !snapshot.createTime.isEqual(origin.createTime)
        || original?.version !== 1 || original.action !== 'share' || original.pin_id !== row.id || original.owner_uid !== row.owner_uid || original.profile_id !== row.profile_id
        || original.account_created_at_ms !== row.account_created_at_ms || original.binding_revision !== row.binding_revision)
        return null;
    return row;
}
function matches(state, source) {
    return state.owner_uid === source.owner.uid && state.profile_id === source.owner.profileId && state.account_created_at_ms === source.owner.created
        && state.binding_revision === source.owner.binding && state.source_create_time === source.sourceTime && state.proof_create_time === source.proofTime;
}
function dto(state, source) {
    return { id: state.id, sourceId: state.source_id, kind: state.kind, sourceType: source.post.type, revision: state.revision,
        publicationRevision: source.post.publicationRevision, userId: source.owner.profileId, caption: source.post.caption, mediaUrl: source.post.mediaUrl, thumbnailUrl: source.post.thumbnailUrl,
        latitude: state.latitude, longitude: state.longitude, precision: 'approximate', radiusMeters: 2000, areaLabel: state.area_label, sharedAt: state.shared_at, author: source.post.author };
}
function ownerView(kind, sourceId, state, source, actor) {
    const ownedSource = source?.owner.uid === actor.uid && source.owner.created === actor.created ? source : null;
    const pin = state?.status === 'shared' && ownedSource && matches(state, ownedSource) ? dto(state, ownedSource) : null;
    const status = pin ? 'shared' : state?.status === 'removed' ? 'removed' : !state && ownedSource ? 'unshared' : 'unavailable';
    return { kind, sourceId, status, revision: state?.revision ?? null, sourceRevision: ownedSource?.revision ?? null, canShare: !!ownedSource, pin };
}
async function admitted(ctx, snapshot) {
    const state = await stateFrom(ctx, snapshot);
    if (!state || state.status !== 'shared')
        return null;
    const source = await sourceFor(ctx, state.kind, state.source_id);
    return source && matches(state, source) ? dto(state, source) : null;
}
export async function manageMapPinForUid(db, auth, uid, raw, now = Date.now()) {
    const input = normalize(raw, uid), started = Date.now(), clock = () => now + Math.max(0, Date.now() - started), nextRevision = freshRevision(), nextCursor = freshRevision();
    return db.runTransaction(async (tx) => {
        const ctx = { db, auth, tx, actor: undefined, clock, identities: new Map(), owners: new Map(), admissions: new Map() };
        const actor = await identity(ctx, uid);
        if (!actor || actor.uid !== uid || actor.profileId !== input.expectedProfileId || actor.created !== input.expectedAccountCreatedAt)
            changed();
        ctx.actor = actor;
        ctx.identities.set(actor.profileId, Promise.resolve(actor));
        const base = () => { const serverTime = clock(); return { ok: true, action: input.action, ownerUid: uid, profileId: actor.profileId, accountCreatedAt: actor.created, serverTime, validUntil: serverTime + LEASE }; };
        if (input.action === 'read') {
            const pin = await admitted(ctx, await tx.get(db.doc(`_map_pins/${input.pinId}`)));
            await finalAuth(ctx);
            return { ...base(), pinId: input.pinId, pin };
        }
        if (input.action === 'list') {
            let query = db.collection('_map_pins').where('kind', '==', input.kind).where('status', '==', 'shared').orderBy('shared_at', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(PAGE + 1);
            let upper = new Date(clock()).toISOString();
            let boundary;
            if (input.cursor) {
                const cursor = (await tx.get(db.doc(`_map_pin_cursors/${input.cursor}`))).data();
                if (!cursor || cursor.version !== 1 || cursor.owner_uid !== uid || cursor.profile_id !== actor.profileId || cursor.account_created_at_ms !== actor.created || cursor.binding_revision !== actor.binding
                    || cursor.kind !== input.kind || !(cursor.expireAt instanceof Timestamp) || cursor.expireAt.toMillis() <= clock()
                    || !validPublicationPostId(cursor.pin_id) || !Object.hasOwn(cursor, 'shared_at') || typeof cursor.upper !== 'string' || !Number.isFinite(Date.parse(cursor.upper))) {
                    throw new HttpsError('failed-precondition', 'This map page expired. Return to the first page.');
                }
                upper = cursor.upper;
                boundary = [cursor.shared_at, cursor.pin_id];
            }
            query = query.where('shared_at', '<=', upper);
            if (boundary)
                query = query.startAfter(...boundary);
            const snapshot = await tx.get(query), candidates = snapshot.docs.slice(0, PAGE);
            const items = (await Promise.all(candidates.map(candidate => admitted(ctx, candidate)))).filter((value) => value !== null);
            await finalAuth(ctx);
            const more = snapshot.size > PAGE, last = candidates.at(-1);
            if (more && last)
                tx.create(db.doc(`_map_pin_cursors/${nextCursor}`), { version: 1, owner_uid: uid, profile_id: actor.profileId, account_created_at_ms: actor.created, binding_revision: actor.binding,
                    kind: input.kind, upper, pin_id: last.id, shared_at: last.data().shared_at, expireAt: Timestamp.fromMillis(clock() + CURSOR_LIFE) });
            return { ...base(), kind: input.kind, items, nextCursor: more ? nextCursor : null };
        }
        const kind = input.kind, sourceId = input.sourceId, pinId = mapPinId(kind, sourceId, uid, actor.created), stateRef = db.doc(`_map_pins/${pinId}`), snapshot = await tx.get(stateRef);
        const state = await stateFrom(ctx, snapshot);
        if (snapshot.exists && (!state || state.owner_uid !== uid || state.profile_id !== actor.profileId || state.account_created_at_ms !== actor.created || state.binding_revision !== actor.binding))
            changed();
        const source = await ownedSourceFor(ctx, kind, sourceId);
        if (input.action === 'state') {
            await finalAuth(ctx);
            return { ...base(), ...ownerView(kind, sourceId, state, source, actor) };
        }
        const fingerprint = mapPinHash(input), receiptId = mapPinHash([uid, actor.created, input.requestId]), receiptRef = db.doc(`_map_pin_receipts/${receiptId}`), receipt = await tx.get(receiptRef), prior = receipt.data();
        if (receipt.exists) {
            if (prior?.version !== 1 || prior.owner_uid !== uid || prior.profile_id !== actor.profileId || prior.account_created_at_ms !== actor.created || prior.binding_revision !== actor.binding
                || prior.request_id !== input.requestId || prior.fingerprint !== fingerprint || prior.action !== input.action || prior.pin_id !== pinId || !revision(prior.revision) || !revision(prior.generation)) {
                throw new HttpsError('already-exists', 'This map sharing request belongs to different details.');
            }
            await finalAuth(ctx);
            const view = ownerView(kind, sourceId, state, source, actor);
            const applied = !!state && state.last_receipt_id === receiptId && state.revision === prior.revision && state.generation === prior.generation
                && (input.action === 'share' ? view.status === 'shared' : view.status === 'removed');
            return { ...base(), ...view, requestId: input.requestId, replayed: true, applied };
        }
        if ((state?.revision ?? null) !== input.expectedRevision)
            stale();
        let next;
        if (input.action === 'share') {
            if (!source || source.owner.uid !== uid || source.owner.created !== actor.created)
                unavailable();
            if (source.revision !== input.expectedSourceRevision)
                stale();
            const area = input.area;
            next = { version: 1, id: pinId, kind, source_id: sourceId, owner_uid: uid, profile_id: actor.profileId, account_created_at_ms: actor.created, binding_revision: actor.binding,
                revision: nextRevision, generation: state?.status === 'shared' && matches(state, source) ? state.generation : freshRevision(), status: 'shared', creation_receipt_id: state?.creation_receipt_id ?? receiptId,
                last_receipt_id: receiptId, source_create_time: source.sourceTime, proof_create_time: source.proofTime, ...approximateMapPinArea(area.latitude, area.longitude), area_label: area.label, shared_at: new Date(clock()).toISOString() };
        }
        else {
            if (!state)
                stale();
            next = { ...state, revision: nextRevision, status: 'removed', last_receipt_id: receiptId };
        }
        await finalAuth(ctx);
        if (snapshot.exists)
            tx.update(stateRef, next);
        else
            tx.create(stateRef, next);
        // Store only the body hash: precise selection coordinates are not retained.
        tx.create(receiptRef, { version: 1, action: input.action, owner_uid: uid, profile_id: actor.profileId, account_created_at_ms: actor.created, binding_revision: actor.binding,
            request_id: input.requestId, fingerprint, pin_id: pinId, revision: next.revision, generation: next.generation, created_at_ms: clock() });
        return { ...base(), ...ownerView(kind, sourceId, next, source, actor), requestId: input.requestId, replayed: false, applied: true };
    });
}
//# sourceMappingURL=mapPinAuthority.js.map