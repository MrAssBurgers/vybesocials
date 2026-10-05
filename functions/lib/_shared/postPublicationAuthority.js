import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { reportStaff } from './reportAuthority.js';
import { admitSound } from '../soundUpload.js';
import { publicationHash, postSourceFingerprint, postLegacyRevision, validPostPublication, validPublicationPostId, validPublicationRevision, validPublicationMediaUrl } from './postPublicationProof.js';
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const rowObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const invalid = (message = 'Invalid post details.') => new HttpsError('invalid-argument', message);
const stale = () => new HttpsError('aborted', 'This post changed. Refresh it before trying again.');
const payloadKeys = ['type', 'caption', 'tags', 'mediaUrl', 'mediaUrls', 'thumbnailUrl', 'ageRating', 'visibility', 'vybeCheckId', 'gameCaptureId', 'soundId', 'filterId'];
const safeUrl = validPublicationMediaUrl;
function caption(value) {
    return typeof value === 'string' && value.length <= 10000 && ![...value].some(char => char.charCodeAt(0) < 32 && !['\n', '\t'].includes(char));
}
function tags(value) {
    return Array.isArray(value) && value.length <= 30 && value.every(tag => typeof tag === 'string' && !!tag.trim() && tag.length <= 100);
}
function normalizePayload(value) {
    if (!rowObject(value) || Object.keys(value).some(key => !payloadKeys.includes(key))
        || !['post', 'short', 'video'].includes(value.type) || !caption(value.caption) || !tags(value.tags)
        || (value.mediaUrl !== null && !safeUrl(value.mediaUrl)) || (value.thumbnailUrl !== null && !safeUrl(value.thumbnailUrl))
        || !Array.isArray(value.mediaUrls) || value.mediaUrls.length > 20 || value.mediaUrls.some(url => !safeUrl(url))
        || !['safe', '13+', '18+', 'unrated'].includes(value.ageRating) || !['public', 'followers', 'friends', 'close_friends', 'only_me'].includes(value.visibility)
        || (value.gameCaptureId !== undefined && (typeof value.gameCaptureId !== 'string' || !/^[a-f0-9]{48}$/.test(value.gameCaptureId)))
        || ['vybeCheckId', 'soundId', 'filterId'].some(key => value[key] != null && !validAudienceId(value[key]))
        || (!value.mediaUrl && (value.type !== 'post' || !value.caption.trim())) || (value.mediaUrls.length && value.mediaUrls[0] !== value.mediaUrl))
        throw invalid();
    return { ...value, vybeCheckId: value.vybeCheckId ?? null, soundId: value.soundId ?? null, filterId: value.filterId ?? null };
}
export function normalizeManagePostInput(raw, uid) {
    if (!rowObject(raw))
        throw invalid();
    if (raw.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen this post.');
    if (!validAudienceId(raw.expectedProfileId) || !validPublicationPostId(raw.postId)
        || !['read', 'create', 'update', 'delete', 'pin', 'recover'].includes(raw.action)
        || Object.keys(raw).some(key => !['expectedOwnerUid', 'expectedProfileId', 'action', 'postId', 'requestId', 'expectedRevision', 'payload'].includes(key)))
        throw invalid();
    const action = raw.action;
    if (action === 'read') {
        if (raw.requestId !== undefined || raw.expectedRevision !== undefined || raw.payload !== undefined)
            throw invalid();
    }
    else if (!uuid(raw.requestId) || (action === 'create' ? raw.expectedRevision !== undefined : !validPublicationRevision(raw.expectedRevision)))
        throw invalid('A stable request and current post revision are required.');
    if (action === 'create' || action === 'recover') {
        const payload = normalizePayload(raw.payload);
        if (action === 'create' && (payload.gameCaptureId ? raw.postId !== `game_${payload.gameCaptureId}` : !uuid(raw.postId)))
            throw invalid('Use a new post identity for this draft.');
    }
    else if (action === 'update') {
        if (!rowObject(raw.payload) || !Object.keys(raw.payload).length || Object.keys(raw.payload).some(key => !['caption', 'tags', 'aiOverride'].includes(key))
            || (raw.payload.caption !== undefined && !caption(raw.payload.caption)) || (raw.payload.tags !== undefined && !tags(raw.payload.tags))
            || (raw.payload.aiOverride !== undefined && raw.payload.aiOverride !== null && typeof raw.payload.aiOverride !== 'boolean'))
            throw invalid();
    }
    else if (action === 'pin') {
        if (!rowObject(raw.payload) || Object.keys(raw.payload).length !== 1 || typeof raw.payload.isPinned !== 'boolean')
            throw invalid();
    }
    else if (raw.payload !== undefined)
        throw invalid();
    return raw;
}
const active = (row) => !row.is_draft && !row.deleted_at && !row.is_deleted && !row.is_hidden && !row.is_removed && !row.removed_at
    && (row.status === undefined || row.status === 'published') && (row.moderation_status === undefined || row.moderation_status === 'approved')
    && (row.vybe_check_status === undefined || row.vybe_check_status === 'approved');
function effectiveLegacyVisibility(row) {
    if (row.is_private !== undefined && row.is_private !== false)
        return 'only_me';
    const restrictions = new Set(['visibility', 'audience'].filter(key => Object.hasOwn(row, key)).map(key => row[key]).filter(level => !['public', 'everyone'].includes(level)));
    if (!restrictions.size)
        return 'public';
    if ([...restrictions].some(level => !['friends', 'close_friends', 'followers'].includes(level)))
        return 'only_me';
    if (restrictions.has('followers') && restrictions.size > 1)
        return 'only_me';
    return restrictions.has('followers') ? 'followers' : restrictions.has('close_friends') ? 'close_friends' : 'friends';
}
function ownerPost(row, id, authorId, trusted = true) {
    try {
        const payload = normalizePayload({ type: row.type, caption: row.caption ?? '', tags: row.tags ?? [], mediaUrl: row.media_url || null, mediaUrls: row.media_urls ?? [],
            thumbnailUrl: row.thumbnail_url ?? null, ageRating: trusted ? row.age_rating ?? 'unrated' : 'unrated', visibility: effectiveLegacyVisibility(row),
            vybeCheckId: trusted ? row.vybe_check_id ?? null : null, ...(row.game_capture_id ? { gameCaptureId: row.game_capture_id } : {}), soundId: row.sound_id ?? null, filterId: row.filter_id ?? null });
        return { ...payload, id, authorId, createdAt: row.created_at instanceof Timestamp ? row.created_at.toDate().toISOString() : row.created_at,
            isPinned: row.is_pinned === true, aiOverride: typeof row.ai_override === 'boolean' ? row.ai_override : null };
    }
    catch {
        return null;
    }
}
async function ownerOf(db, tx, row) {
    if (!row || !validAudienceId(row.author_id))
        return null;
    const owner = await resolveIdentity(db, tx, row.author_id);
    return owner && (row.user_id === undefined || owner.aliases.includes(row.user_id)) ? owner : null;
}
function freshRow(payload, owner, id, now) {
    return { id, author_id: owner.profileId, type: payload.type, caption: payload.caption, tags: payload.tags, media_url: payload.mediaUrl, media_urls: payload.mediaUrls,
        thumbnail_url: payload.thumbnailUrl, age_rating: payload.ageRating, visibility: payload.visibility, created_at: new Date(now).toISOString(), status: 'published',
        vybe_check_id: payload.vybeCheckId, ...(payload.vybeCheckId ? { vybe_check_status: 'approved' } : {}),
        ...(payload.gameCaptureId ? { game_capture_id: payload.gameCaptureId } : {}), sound_id: payload.soundId, filter_id: payload.filterId,
        is_pinned: false, ai_override: null, like_count: 0, comment_count: 0, view_count: 0 };
}
export async function runManagePost(db, uid, raw, now = Date.now()) {
    const input = normalizeManagePostInput(raw, uid), revision = randomBytes(24).toString('hex'), digest = publicationHash(raw);
    return db.runTransaction(async (tx) => {
        const actor = await resolveIdentity(db, tx, uid);
        if (!actor || actor.uid !== uid || actor.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile changed. Reopen this post.');
        const ref = db.collection('posts').doc(input.postId), proofRef = db.collection('_post_publications').doc(input.postId);
        const [snapshot, proofSnap] = await tx.getAll(ref, proofRef), original = snapshot.data(), proof = proofSnap.data();
        const owner = await ownerOf(db, tx, original), trusted = !!original && !!owner && validPostPublication(original, proof, owner, input.postId);
        const currentRevision = proof && validPublicationRevision(proof.revision) ? proof.revision : original ? postLegacyRevision(original) : null;
        const status = proof?.status === 'deleted' ? 'deleted' : !original ? 'missing' : trusted ? 'published' : 'legacy';
        let staff = false;
        if (original && owner?.uid !== uid && ['read', 'delete'].includes(input.action)) {
            await reportStaff(tx, db, uid);
            staff = true;
        }
        if (input.action === 'read') {
            if (original && owner?.uid !== uid && !staff)
                throw new HttpsError('permission-denied', 'Only the author can edit this post.');
            if (!original && proof && proof.owner_uid !== uid)
                throw new HttpsError('permission-denied', 'This post is unavailable.');
            return { ok: true, ownerUid: uid, profileId: actor.profileId, action: input.action, postId: input.postId, requestId: null,
                revision: status === 'deleted' || status === 'missing' ? null : currentRevision, status, post: original && status !== 'deleted' ? ownerPost(original, input.postId, owner?.profileId ?? '', trusted) : null,
                created: false, needsOwnerConfirmation: status === 'legacy', unpinnedPostIds: [] };
        }
        const receiptRef = db.collection('_post_publication_receipts').doc(publicationHash([uid, input.requestId]));
        const prior = (await tx.get(receiptRef)).data();
        if (prior) {
            if (prior.owner_uid !== uid || prior.profile_id !== actor.profileId || prior.fingerprint !== digest)
                throw new HttpsError('already-exists', 'This retry belongs to a different post change.');
            if (prior.committed_revision !== currentRevision || prior.receipt?.status !== status
                || (status === 'published' && (!original || !active(original))))
                throw new HttpsError('failed-precondition', 'This change already completed, but the post changed afterward. Refresh the post.');
            return prior.receipt;
        }
        if (input.action === 'create') {
            if (snapshot.exists || proofSnap.exists)
                throw new HttpsError('already-exists', 'This post identity was already used. Refresh before retrying.');
        }
        else {
            if (!original || status === 'deleted' || (!staff && owner?.uid !== uid))
                throw new HttpsError('permission-denied', 'This post is unavailable.');
            if (input.expectedRevision !== currentRevision)
                throw stale();
            if (proof && !trusted && !(staff && input.action === 'delete'))
                throw new HttpsError('failed-precondition', 'This publication needs repair. It was not republished.');
            if (input.action === 'recover' ? trusted : input.action !== 'delete' && !trusted)
                throw new HttpsError('failed-precondition', trusted ? 'This post is already confirmed. Refresh it.' : 'Review and share this older post before changing it.');
            if (input.action !== 'delete' && !active(original))
                throw new HttpsError('failed-precondition', 'This post is unavailable for publication.');
        }
        let next = original ? { ...original } : null;
        let game;
        if (input.action === 'create' || input.action === 'recover') {
            const payload = normalizePayload(input.payload);
            if (payload.soundId && !await admitSound(db, tx, actor, payload.soundId))
                throw new HttpsError('failed-precondition', 'This sound is no longer available. Choose a current sound.');
            if (payload.filterId) {
                const filter = (await tx.get(db.collection('filters').doc(payload.filterId))).data();
                const creator = filter && validAudienceId(filter.creator_id) ? await resolveIdentity(db, tx, filter.creator_id) : null;
                if (!filter || filter.is_published !== true || filter.is_approved !== true || filter.deleted_at || filter.is_deleted || !creator)
                    throw new HttpsError('failed-precondition', 'This filter is no longer available. Choose a current filter.');
                if (creator.uid !== uid) {
                    const blocks = await Promise.all([tx.get(db.collection('blocked_users').where('blocker_id', 'in', actor.aliases).where('blocked_id', 'in', creator.aliases).limit(1)),
                        tx.get(db.collection('blocked_users').where('blocker_id', 'in', creator.aliases).where('blocked_id', 'in', actor.aliases).limit(1))]);
                    if (blocks.some(rows => !rows.empty))
                        throw new HttpsError('permission-denied', 'This filter is unavailable.');
                }
            }
            if (payload.vybeCheckId) {
                const check = (await tx.get(db.collection('vybe_checks').doc(payload.vybeCheckId))).data();
                if (!check || check.user_id !== uid || !['approved', 'limited'].includes(check.status))
                    throw new HttpsError('failed-precondition', 'Vybe Check could not be confirmed. Run the check again.');
                if (check.status === 'limited' && payload.ageRating === 'safe')
                    payload.ageRating = '13+';
            }
            else
                payload.ageRating = 'unrated';
            if (input.action === 'recover' && original?.game_capture_id !== undefined && payload.gameCaptureId !== original.game_capture_id)
                throw invalid('Keep the existing game capture identity.');
            if (payload.gameCaptureId) {
                game = (await tx.get(db.collection('game_captures').doc(payload.gameCaptureId))).data();
                if (input.postId !== `game_${payload.gameCaptureId}` || !game || game.owner_uid !== uid
                    || (input.action === 'create' ? game.status !== 'ready' || typeof game.expires_at_ms !== 'number' || game.expires_at_ms <= now
                        : !['ready', 'imported'].includes(game.status) || (game.post_id && game.post_id !== input.postId)))
                    throw new HttpsError('failed-precondition', 'This game capture is no longer available to publish.');
            }
            next = freshRow(payload, actor, input.postId, now);
        }
        else if (input.action === 'update') {
            const payload = input.payload;
            if (payload.caption !== undefined)
                next.caption = payload.caption;
            if (payload.tags !== undefined)
                next.tags = payload.tags;
            if (payload.aiOverride !== undefined)
                next.ai_override = payload.aiOverride;
            if (!next.media_url && !next.caption?.trim())
                throw invalid('Add text before saving this post.');
            next.updated_at = new Date(now).toISOString();
        }
        else if (input.action === 'pin')
            next.is_pinned = input.payload.isPinned;
        const unpinned = [];
        if (input.action === 'pin' && input.payload.isPinned) {
            // A protected owner lock makes concurrent pins serialize, including new
            // matching documents that were absent from the first query snapshot.
            await tx.get(db.collection('_post_pin_state').doc(uid));
            const pins = await tx.get(db.collection('posts').where('author_id', 'in', actor.aliases).where('is_pinned', '==', true).limit(51));
            if (pins.size > 50)
                throw new HttpsError('resource-exhausted', 'Pinned posts need repair. Unpin an older post and retry.');
            const others = pins.docs.filter(doc => doc.id !== input.postId).sort((a, b) => String(a.data().created_at).localeCompare(String(b.data().created_at)) || a.id.localeCompare(b.id));
            for (const candidate of others.slice(0, Math.max(0, others.length - 2)))
                unpinned.push({ ref: candidate.ref, row: candidate.data(), proof: (await tx.get(db.collection('_post_publications').doc(candidate.id))).data() });
        }
        const deleted = input.action === 'delete', finalOwner = owner ?? actor;
        const receipt = { ok: true, ownerUid: uid, profileId: actor.profileId, action: input.action, postId: input.postId, requestId: input.requestId,
            revision: deleted ? null : revision, status: deleted ? 'deleted' : 'published', post: deleted ? null : ownerPost(next, input.postId, actor.profileId),
            created: input.action === 'create', needsOwnerConfirmation: false, unpinnedPostIds: unpinned.map(row => row.ref.id) };
        if (deleted)
            tx.delete(ref);
        else
            tx.set(ref, next);
        tx.set(proofRef, { version: 1, post_id: input.postId, owner_uid: deleted ? finalOwner.uid : uid, profile_id: deleted ? finalOwner.profileId : actor.profileId,
            revision, status: deleted ? 'deleted' : 'published', source_fingerprint: deleted ? null : postSourceFingerprint(next), updated_at: Timestamp.fromMillis(now) });
        for (const item of unpinned) {
            tx.update(item.ref, { is_pinned: false });
            if (validPostPublication(item.row, item.proof, actor, item.ref.id))
                tx.update(db.collection('_post_publications').doc(item.ref.id), { revision: randomBytes(24).toString('hex'), updated_at: Timestamp.fromMillis(now) });
        }
        if (input.action === 'pin')
            tx.set(db.collection('_post_pin_state').doc(uid), { revision, updated_at: Timestamp.fromMillis(now) });
        if (game)
            tx.update(db.collection('game_captures').doc(next.game_capture_id), { status: 'imported', post_id: input.postId, imported_at: new Date(now).toISOString(), cleanup_at_ms: now });
        tx.create(receiptRef, { owner_uid: uid, profile_id: actor.profileId, fingerprint: digest, committed_revision: revision, receipt, created_at: Timestamp.fromMillis(now) });
        return receipt;
    });
}
//# sourceMappingURL=postPublicationAuthority.js.map