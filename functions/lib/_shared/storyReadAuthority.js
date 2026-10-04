import { getStorage } from 'firebase-admin/storage';
import { HttpsError } from 'firebase-functions/v2/https';
import { storyStoragePath } from './storyPublishAuthority.js';
import { closeFriendAuthorityId, hasCloseFriendAuthority, resolveIdentity } from './profileAudienceAuthority.js';
export { closeFriendAuthorityId } from './profileAudienceAuthority.js';
const text = (value, max) => typeof value === 'string' && value.length <= max ? value : null;
function safePoll(value) {
    if (value == null)
        return null;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const row = value;
    if (!['poll', 'question'].includes(String(row.type)) || !text(row.question, 100) || !Array.isArray(row.options)
        || row.options.some(option => !text(option, 30)) || (row.type === 'question' ? row.options.length !== 0 : row.options.length < 2 || row.options.length > 4))
        return false;
    return { type: row.type, question: row.question, options: row.options };
}
const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
const unavailable = () => new HttpsError('failed-precondition', 'Your story identity could not be verified. Refresh your profile and retry.');
export function normalizeStoryListInput(raw, uid) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new HttpsError('invalid-argument', 'Story viewing details are required.');
    const value = raw;
    if (value.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Reopen stories.');
    if (!validId(value.expectedProfileId) || Object.keys(value).some(key => !['expectedOwnerUid', 'expectedProfileId', 'cursor', 'authorId', 'storyIds'].includes(key)))
        throw new HttpsError('invalid-argument', 'Invalid story viewing request.');
    if (['cursor', 'authorId', 'storyIds'].filter(key => value[key] !== undefined).length > 1
        || (value.cursor !== undefined && !validId(value.cursor)) || (value.authorId !== undefined && !validId(value.authorId))
        || (value.storyIds !== undefined && (!Array.isArray(value.storyIds) || value.storyIds.length < 1 || value.storyIds.length > 50 || value.storyIds.some(id => !validId(id)))))
        throw new HttpsError('invalid-argument', 'Invalid story selection.');
    return value;
}
/** Existing download tokens only: no token creation, signing, or remote URL fetch. */
export async function resolveStoryReadMedia(value, ownerUid) {
    const bucket = getStorage().bucket();
    try {
        const path = storyStoragePath(value, ownerUid, bucket.name, process.env.FIREBASE_STORAGE_EMULATOR_HOST);
        if (!value.startsWith('gs:'))
            return value;
        const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
        const demo = /^demo-/.test(process.env.GCLOUD_PROJECT || '');
        if (demo && (!emulator || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)))
            return null;
        // Use the configured bucket's metadata transport. Admin getDownloadURL has
        // a different emulator env name and can otherwise select an external URL.
        const [metadata] = await bucket.file(path).getMetadata();
        const tokens = metadata.metadata?.firebaseStorageDownloadTokens;
        if (typeof tokens !== 'string')
            return null;
        const token = tokens.split(',')[0].trim();
        if (!token || token.length > 2048)
            return null;
        const origin = demo ? process.env.GCLOUD_PROJECT === 'demo-vybe-preview' ? 'http://127.0.0.1:8082' : `http://${emulator}` : 'https://firebasestorage.googleapis.com';
        return `${origin}/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
    }
    catch {
        return null;
    }
}
export async function listVisibleStoriesForViewer(db, uid, raw, resolveMedia = resolveStoryReadMedia, nowMs = Date.now()) {
    const input = normalizeStoryListInput(raw, uid);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs > 8_640_000_000_000_000)
        throw new HttpsError('failed-precondition', 'Story time could not be verified. Retry later.');
    const result = await db.runTransaction(async (tx) => {
        const viewer = await resolveIdentity(db, tx, uid);
        if (!viewer || viewer.uid !== uid || viewer.profileId !== input.expectedProfileId)
            throw unavailable();
        const friendshipPages = await Promise.all(['sender_id', 'receiver_id'].map(field => tx.get(db.collection('friend_requests')
            .where(field, 'in', viewer.aliases).where('status', '==', 'accepted').limit(1001))));
        if (friendshipPages.some(page => page.size > 1000))
            throw new HttpsError('resource-exhausted', 'This story friend list is too large to load safely. Contact support.');
        const friends = new Set();
        for (const page of friendshipPages)
            for (const doc of page.docs) {
                const row = doc.data();
                const other = viewer.aliases.includes(row.sender_id) ? row.receiver_id : viewer.aliases.includes(row.receiver_id) ? row.sender_id : null;
                if (validId(other) && !viewer.aliases.includes(other))
                    friends.add(other);
            }
        const sortedFriends = [...friends].sort();
        const directStories = input.storyIds ? await Promise.all([...new Set(input.storyIds)].map(id => tx.get(db.collection('stories').doc(id)))) : null;
        let selected;
        let nextCursor = null;
        if (directStories)
            selected = [...new Set(directStories.filter(doc => doc.exists).map(doc => doc.data().author_id).filter(validId))];
        else if (input.authorId)
            selected = [input.authorId];
        else {
            const candidates = sortedFriends.filter(id => !input.cursor || id > input.cursor);
            const page = candidates.slice(0, input.cursor ? 10 : 9);
            selected = input.cursor ? page : [viewer.profileId, ...page];
            if (candidates.length > page.length)
                nextCursor = page.at(-1);
        }
        const identities = await Promise.all(selected.map(alias => resolveIdentity(db, tx, alias)));
        const authors = new Map();
        for (const identity of identities)
            if (identity && (identity.uid === uid || identity.aliases.some(alias => friends.has(alias))))
                authors.set(identity.profileId, identity);
        const visible = [];
        for (const author of authors.values()) {
            const self = author.uid === uid;
            if (!self) {
                const blocks = await Promise.all([
                    tx.get(db.collection('blocked_users').where('blocker_id', 'in', viewer.aliases).where('blocked_id', 'in', author.aliases).limit(1)),
                    tx.get(db.collection('blocked_users').where('blocker_id', 'in', author.aliases).where('blocked_id', 'in', viewer.aliases).limit(1)),
                ]);
                if (blocks.some(page => !page.empty))
                    continue;
            }
            // Filter a query by both parties. A malformed/foreign owner grant cannot
            // authorize viewing, and deleting the grant is observed on every call.
            const closeGrant = self ? null : await tx.get(db.collection('_close_friend_authority').doc(closeFriendAuthorityId(author.uid, viewer.uid)));
            const maySeeClose = self || hasCloseFriendAuthority(closeGrant?.data(), author, viewer);
            if (!self) {
                const visibility = await tx.get(db.collection('profile_visibility').doc(author.profileId));
                const fields = visibility.data()?.fields;
                const level = fields && typeof fields === 'object' && !Array.isArray(fields) ? fields.stories ?? 'friends' : visibility.exists ? null : 'friends';
                // A profile's explicit denial also applies to direct IDs and the feed.
                // "Everyone" never broadens the story feed beyond accepted friends.
                if (!['friends', 'public', 'everyone'].includes(String(level)) && !(level === 'close_friends' && maySeeClose))
                    continue;
            }
            const rows = directStories ? directStories.filter(doc => doc.exists && author.aliases.includes(doc.data().author_id))
                : (await tx.get(db.collection('stories').where('author_id', 'in', author.aliases).where('expires_at', '>', new Date(nowMs).toISOString()).orderBy('expires_at', 'desc').limit(100))).docs;
            for (const doc of rows) {
                const row = doc.data();
                const poll = safePoll(row.poll_data);
                if (row.is_deleted === true || row.deleted_at || !['image', 'video'].includes(String(row.media_type)) || !text(row.media_url, 8192)
                    || (row.thumbnail_url != null && !text(row.thumbnail_url, 8192)) || (row.caption != null && text(row.caption, 2200) === null) || poll === false
                    || (row.aspect_ratio != null && (typeof row.aspect_ratio !== 'number' || !Number.isFinite(row.aspect_ratio) || row.aspect_ratio < 0.1 || row.aspect_ratio > 10))
                    || (row.duration != null && (typeof row.duration !== 'number' || !Number.isFinite(row.duration) || row.duration < 0 || row.duration > 60))
                    || typeof row.expires_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(row.expires_at) || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= nowMs
                    || typeof row.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)) || Date.parse(row.created_at) > nowMs
                    || (row.is_close_friends_only !== false && !(row.is_close_friends_only === true && maySeeClose)))
                    continue;
                // Never return arbitrary internal fields, publication receipts or owner UIDs.
                const authorDto = { id: author.profileId, username: text(author.row.username, 128) || '', avatar_url: text(author.row.avatar_url, 8192),
                    display_name: text(author.row.display_name, 256), equipped_profile_theme: text(author.row.equipped_profile_theme, 128) };
                visible.push({ ownerUid: author.uid, row: { id: doc.id, author_id: author.profileId, media_url: row.media_url, media_type: row.media_type,
                        thumbnail_url: typeof row.thumbnail_url === 'string' ? row.thumbnail_url : null, caption: typeof row.caption === 'string' ? row.caption : null,
                        is_close_friends_only: row.is_close_friends_only, view_count: Number.isSafeInteger(row.view_count) && Number(row.view_count) >= 0 ? row.view_count : 0,
                        created_at: row.created_at, expires_at: row.expires_at, aspect_ratio: typeof row.aspect_ratio === 'number' ? row.aspect_ratio : 0.5625,
                        duration: typeof row.duration === 'number' ? row.duration : null, poll_data: poll, author: authorDto, has_viewed: self } });
            }
        }
        return { profileId: viewer.profileId, visible, nextCursor };
    });
    const stories = [];
    // Bounded batches avoid a burst of metadata requests for legacy gs: stories.
    for (let i = 0; i < result.visible.length; i += 20) {
        const batch = await Promise.all(result.visible.slice(i, i + 20).map(async ({ row, ownerUid }) => {
            const media = await resolveMedia(String(row.media_url), ownerUid);
            if (!media)
                return null;
            const thumbnail = row.thumbnail_url ? await resolveMedia(String(row.thumbnail_url), ownerUid) : null;
            return { ...row, media_url: media, thumbnail_url: thumbnail };
        }));
        for (const row of batch)
            if (row)
                stories.push(row);
    }
    stories.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || String(a.id).localeCompare(String(b.id)));
    return { success: true, ownerUid: uid, profileId: result.profileId, stories, nextCursor: result.nextCursor };
}
//# sourceMappingURL=storyReadAuthority.js.map