import { randomBytes } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { closeFriendAuthorityId, hasCloseFriendAuthority, normalizedProfileSettings, resolveIdentity, validAudienceId } from './profileAudienceAuthority.js';
import { followAuthorityId, hasApprovedFollow, hasCurrentFollow } from './followAuthority.js';
import { isLocalArea, nearbyLocalArea, sameLocalArea } from './localArea.js';
import { validPostLocalProof } from './postLocalAreaAuthority.js';
import { rankSocialPosts } from './socialFeedRanking.js';
const PAGE_SIZE = 20;
const CURSOR_TTL = 10 * 60 * 1000;
export function normalizeSocialPostPreviewsInput(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Post details are required.');
    const row = raw;
    if (row.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen the post.');
    if (!validAudienceId(row.expectedProfileId)
        || Object.keys(row).some(key => !['expectedOwnerUid', 'expectedProfileId', 'postIds'].includes(key))
        || !Array.isArray(row.postIds) || row.postIds.length < 1 || row.postIds.length > PAGE_SIZE
        || row.postIds.some(id => !validAudienceId(id)) || new Set(row.postIds).size !== row.postIds.length) {
        throw new HttpsError('invalid-argument', 'Choose between one and twenty distinct posts.');
    }
    return row;
}
export function normalizeSocialFeedInput(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Feed details are required.');
    const row = raw;
    if (row.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen the feed.');
    if (!validAudienceId(row.expectedProfileId) || Object.keys(row).some(key => !['expectedOwnerUid', 'expectedProfileId', 'cursor', 'contentType', 'feed', 'area'].includes(key))
        || (row.feed !== undefined && !['discover', 'personalized', 'following', 'local'].includes(row.feed))
        || (row.feed === 'local' ? !isLocalArea(row.area) : row.area !== undefined)
        || (row.contentType !== undefined && !['post', 'short', 'video'].includes(row.contentType))
        || (row.cursor !== undefined && (typeof row.cursor !== 'string' || !/^[a-f0-9]{48}$/.test(row.cursor)))) {
        throw new HttpsError('invalid-argument', 'Invalid feed selection.');
    }
    return row;
}
const text = (value, max) => typeof value === 'string' && value.length <= max ? value : null;
const counter = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
function httpsUrl(value) {
    if (typeof value !== 'string' || value.length > 8192)
        return null;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    }
    catch {
        return null;
    }
}
function dateText(value) {
    if (value instanceof Timestamp)
        return value.toDate().toISOString();
    return typeof value === 'string' && value.length <= 32 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
async function authorAdmission(db, tx, viewer, alias) {
    const author = await resolveIdentity(db, tx, alias);
    if (!author)
        return null;
    const settings = normalizedProfileSettings((await tx.get(db.collection('profile_visibility').doc(author.profileId))).data(), author.profileId);
    const self = author.uid === viewer.uid;
    if (author.row.is_private != null && typeof author.row.is_private !== 'boolean')
        return null;
    const follow = self ? undefined : (await tx.get(db.collection('_follow_authority').doc(followAuthorityId(author.uid, viewer.uid)))).data();
    if (author.row.is_private === true && !self && !hasApprovedFollow(follow, author, viewer))
        return null;
    let friend = false;
    let close = false;
    if (!self) {
        const [outgoing, incoming, blocked, blocking, proof] = await Promise.all([
            tx.get(db.collection('friend_requests').where('sender_id', 'in', viewer.aliases).where('receiver_id', 'in', author.aliases).where('status', '==', 'accepted').limit(1)),
            tx.get(db.collection('friend_requests').where('sender_id', 'in', author.aliases).where('receiver_id', 'in', viewer.aliases).where('status', '==', 'accepted').limit(1)),
            tx.get(db.collection('blocked_users').where('blocker_id', 'in', viewer.aliases).where('blocked_id', 'in', author.aliases).limit(1)),
            tx.get(db.collection('blocked_users').where('blocker_id', 'in', author.aliases).where('blocked_id', 'in', viewer.aliases).limit(1)),
            tx.get(db.collection('_close_friend_authority').doc(closeFriendAuthorityId(author.uid, viewer.uid))),
        ]);
        if (!blocked.empty || !blocking.empty)
            return null;
        friend = !outgoing.empty || !incoming.empty;
        close = friend && hasCloseFriendAuthority(proof.data(), author, viewer);
    }
    const allows = (level) => typeof level === 'string' && ['public', 'everyone', 'friends', 'close_friends', 'only_me', 'private'].includes(level)
        && (self || level === 'public' || level === 'everyone' || (level === 'friends' && friend) || (level === 'close_friends' && close));
    return { author, settings, allows, connected: !self && (friend || hasCurrentFollow(follow, author, viewer)) };
}
function projectPost(id, row, admission) {
    const { author, allows, settings } = admission;
    if (typeof row.type !== 'string' || !['post', 'short', 'video'].includes(row.type) || !allows(settings[row.type === 'short' ? 'clips' : 'posts']))
        return null;
    // Apply every explicit restriction; unknown legacy values never widen access.
    for (const key of ['visibility', 'audience'])
        if (Object.hasOwn(row, key) && !allows(row[key]))
            return null;
    if (Object.hasOwn(row, 'is_private') && (typeof row.is_private !== 'boolean' || (row.is_private && !allows('only_me'))))
        return null;
    if (row.deleted_at || row.is_deleted || row.is_hidden || row.is_removed || row.removed_at
        || (row.status !== undefined && row.status !== 'published')
        || (row.moderation_status !== undefined && row.moderation_status !== 'approved')
        || (row.vybe_check_status !== undefined && row.vybe_check_status !== 'approved'))
        return null;
    const caption = text(row.caption ?? '', 10000), createdAt = dateText(row.created_at);
    const username = text(author.row.username, 100);
    if (caption === null || !createdAt || !username?.trim())
        return null;
    const mediaUrl = row.media_url ? httpsUrl(row.media_url) : null;
    if (row.media_url && !mediaUrl)
        return null;
    if (!mediaUrl && (row.type !== 'post' || !caption.trim()))
        return null;
    const mediaUrls = row.media_urls == null ? [] : row.media_urls;
    if (!Array.isArray(mediaUrls) || mediaUrls.length > 20 || mediaUrls.some(url => !httpsUrl(url)))
        return null;
    const ageRating = row.age_rating ?? 'unrated';
    if (typeof ageRating !== 'string' || !['safe', '13+', '18+', 'unrated'].includes(ageRating))
        return null;
    return {
        id, type: row.type, caption, createdAt,
        mediaUrl, mediaUrls: mediaUrls.map(url => httpsUrl(url)), thumbnailUrl: httpsUrl(row.thumbnail_url), ageRating,
        // Presentation snapshots only; these counters never establish permission or reward eligibility.
        likeCount: counter(row.like_count), commentCount: counter(row.comment_count), viewCount: counter(row.view_count), isPinned: row.is_pinned === true,
        tags: Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === 'string' && tag.length <= 100).slice(0, 30) : [],
        author: { id: author.profileId, username, displayName: text(author.row.display_name, 200), avatarUrl: httpsUrl(author.row.avatar_url) },
    };
}
/** Known-ID previews use exactly the feed's current audience/author projection.
 * No stored message caption, thumbnail or media URL can grant access.
 * Missing and inaccessible IDs both disappear from the admitted results.
 */
export async function readSocialPostPreviewsPage(db, uid, raw) {
    const input = normalizeSocialPostPreviewsInput(raw, uid);
    return db.runTransaction(async (tx) => {
        const viewer = await resolveIdentity(db, tx, uid);
        if (!viewer || viewer.uid !== uid || viewer.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile changed. Reopen the post.');
        const candidates = await tx.getAll(...input.postIds.map(id => db.collection('posts').doc(id)));
        const admissions = new Map();
        const posts = [];
        for (const candidate of candidates) {
            const row = candidate.data();
            if (!row || !validAudienceId(row.author_id))
                continue;
            if (!admissions.has(row.author_id))
                admissions.set(row.author_id, authorAdmission(db, tx, viewer, row.author_id));
            const admission = await admissions.get(row.author_id);
            if (!admission || (row.user_id !== undefined && (typeof row.user_id !== 'string' || !admission.author.aliases.includes(row.user_id))))
                continue;
            const projected = projectPost(candidate.id, row, admission);
            if (projected)
                posts.push(projected);
        }
        return { ownerUid: uid, viewerProfileId: viewer.profileId, requestedPostIds: input.postIds, posts };
    });
}
/** Account-bound reader with a separately authorized external public-feed boundary. */
export async function readSocialFeedPage(db, uid, raw, nowMs = Date.now(), external) {
    const input = normalizeSocialFeedInput(raw, uid);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 8_640_000_000_000_000 - CURSOR_TTL)
        throw new HttpsError('failed-precondition', 'Feed time is unavailable.');
    if (external && (!/^[a-f0-9]{32}$/.test(external.connectionId) || typeof external.authorize !== 'function'
        || (input.feed !== undefined && input.feed !== 'discover')))
        throw new HttpsError('invalid-argument', 'Unsupported external feed request.');
    // Opaque server-owned cursors do not disclose IDs or timestamps of excluded posts.
    const newCursor = randomBytes(24).toString('hex');
    return db.runTransaction(async (tx) => {
        if (external)
            await external.authorize(tx);
        const viewer = await resolveIdentity(db, tx, uid);
        if (!viewer || viewer.uid !== uid || viewer.profileId !== input.expectedProfileId)
            throw new HttpsError('failed-precondition', 'Your profile changed. Reopen the feed.');
        let query = db.collection('posts').orderBy('created_at', 'desc').orderBy(FieldPath.documentId(), 'desc').limit(PAGE_SIZE + 1);
        if (input.cursor) {
            const cursor = (await tx.get(db.collection('_social_feed_cursors').doc(input.cursor))).data();
            if (!cursor || cursor.version !== 1 || cursor.owner_uid !== uid || cursor.profile_id !== viewer.profileId
                || (cursor.partner_connection_id ?? null) !== (external?.connectionId ?? null)
                || !(cursor.expires_at instanceof Timestamp) || cursor.expires_at.toMillis() <= nowMs
                || typeof cursor.post_id !== 'string' || !cursor.post_id || cursor.post_id.includes('/') || Buffer.byteLength(cursor.post_id) > 1500
                || (cursor.content_type ?? null) !== (input.contentType ?? null)
                || (cursor.feed ?? 'discover') !== (input.feed ?? 'discover')
                || !sameLocalArea(cursor.area, input.area)
                || !Object.hasOwn(cursor, 'created_at'))
                throw new HttpsError('failed-precondition', 'This feed page expired. Refresh the feed.');
            query = query.startAfter(cursor.created_at, cursor.post_id);
        }
        if (input.feed === 'following') {
            const connections = await Promise.all([
                tx.get(db.collection('friend_requests').where('sender_id', 'in', viewer.aliases).where('status', '==', 'accepted').limit(1)),
                tx.get(db.collection('friend_requests').where('receiver_id', 'in', viewer.aliases).where('status', '==', 'accepted').limit(1)),
                tx.get(db.collection('_follow_authority').where('follower_uid', '==', viewer.uid).where('status', '==', 'active').limit(1)),
            ]);
            // An empty connection set cannot contain older matching posts. Avoid
            // sending new accounts through empty pages of the entire global timeline.
            if (connections.every(result => result.empty))
                return { ownerUid: uid, viewerProfileId: viewer.profileId,
                    contentType: input.contentType ?? null, feed: 'following', posts: [], nextCursor: null };
        }
        const snapshot = await tx.get(query);
        const candidates = snapshot.docs.slice(0, PAGE_SIZE);
        const admissions = new Map();
        let posts = [];
        for (const post of candidates) {
            const row = post.data();
            if (input.contentType && row.type !== input.contentType)
                continue;
            // Historical aliases may identify the same account; conflicting owners cannot.
            if (!validAudienceId(row.author_id))
                continue;
            if (!admissions.has(row.author_id))
                admissions.set(row.author_id, authorAdmission(db, tx, viewer, row.author_id));
            const admission = await admissions.get(row.author_id);
            if (!admission || (row.user_id !== undefined && (typeof row.user_id !== 'string' || !admission.author.aliases.includes(row.user_id))))
                continue;
            if (input.feed === 'following' && !admission.connected)
                continue;
            if (external) {
                // Relationships and self access must never widen this initial external
                // surface. Require an explicit public author and public post audience.
                const publicLevel = (level) => level === 'public' || level === 'everyone';
                if (admission.author.row.is_private !== false || row.age_rating !== 'safe'
                    || !publicLevel(admission.settings[row.type === 'short' ? 'clips' : 'posts'])
                    || !(publicLevel(row.visibility) || publicLevel(row.audience))
                    || ['visibility', 'audience'].some(key => Object.hasOwn(row, key) && !publicLevel(row[key]))
                    || (row.is_private !== undefined && row.is_private !== false))
                    continue;
            }
            const projected = projectPost(post.id, row, admission);
            if (!projected)
                continue;
            if (input.feed === 'local') {
                const proof = (await tx.get(db.collection('_post_local_areas').doc(post.id))).data();
                if (!validPostLocalProof(proof, admission.author, post.id) || !proof?.enabled || !isLocalArea(proof.area) || !nearbyLocalArea(input.area, proof.area))
                    continue;
            }
            posts.push(projected);
        }
        if (input.feed === 'personalized' && posts.length) {
            const history = [];
            for (const alias of viewer.aliases) {
                const rows = await tx.get(db.collection('likes').where('user_id', '==', alias).orderBy('created_at', 'desc').limit(100));
                history.push(...rows.docs.map(doc => doc.data()));
            }
            const signals = await tx.get(db.collection('post_mood_signals').where('post_id', 'in', posts.map(post => post.id)).limit(141));
            if (signals.size > 140)
                throw new HttpsError('resource-exhausted', 'Feed ranking needs repair. Please contact support.');
            posts = rankSocialPosts(posts, history, signals.docs.map(doc => doc.data()));
        }
        // Only enrich admitted posts. Never fetch raw post documents again on the client.
        // One query per viewer alias avoids Firestore's Cartesian IN-query limit.
        const reactions = new Map();
        const bookmarks = new Set();
        if (posts.length && !external) {
            const ids = posts.map(post => post.id);
            for (const alias of viewer.aliases) {
                const [likes, saved] = await Promise.all([
                    tx.get(db.collection('likes').where('user_id', '==', alias).where('post_id', 'in', ids).limit(101)),
                    tx.get(db.collection('bookmarks').where('user_id', '==', alias).where('post_id', 'in', ids).limit(101)),
                ]);
                if (likes.size > 100 || saved.size > 100)
                    throw new HttpsError('resource-exhausted', 'Feed interactions need repair. Please contact support.');
                for (const like of likes.docs) {
                    const row = like.data();
                    if (!reactions.has(row.post_id))
                        reactions.set(row.post_id, ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'].includes(row.reaction_type) ? row.reaction_type : 'like');
                }
                for (const savedPost of saved.docs)
                    bookmarks.add(savedPost.data().post_id);
            }
        }
        let nextCursor = null;
        const last = candidates.at(-1);
        if (snapshot.size > PAGE_SIZE && last) {
            // The raw boundary may be malformed content. Firestore still orders it;
            // retain it privately so a bad row cannot permanently strand pagination.
            tx.create(db.collection('_social_feed_cursors').doc(newCursor), {
                version: 1, owner_uid: uid, profile_id: viewer.profileId, post_id: last.id, partner_connection_id: external?.connectionId ?? null,
                created_at: last.data().created_at, content_type: input.contentType ?? null, feed: input.feed ?? 'discover', area: input.area ?? null, expires_at: Timestamp.fromMillis(nowMs + CURSOR_TTL),
            });
            nextCursor = newCursor;
        }
        return { ownerUid: uid, viewerProfileId: viewer.profileId, contentType: input.contentType ?? null, feed: input.feed ?? 'discover',
            ...(input.feed === 'local' ? { area: input.area } : {}),
            posts: posts.map(post => ({ ...post, reactionType: reactions.get(post.id) ?? null, isBookmarked: bookmarks.has(post.id) })), nextCursor };
    });
}
//# sourceMappingURL=socialFeedAuthority.js.map