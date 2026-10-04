import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { getStorage } from 'firebase-admin/storage';
export const STORY_LIFETIME_MS = 24 * 60 * 60_000;
export const STORY_DAILY_LIMIT = 50;
export const storyRequestKey = (uid, requestId, destination) => createHash('sha256').update(JSON.stringify([uid, requestId, destination])).digest('hex');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = (message) => new HttpsError('invalid-argument', message);
const unavailable = () => new HttpsError('failed-precondition', 'This story receipt needs verification. It has not been republished.');
const isRow = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.includes('/');
function mediaUrl(value) {
    if (typeof value !== 'string' || !value || value.length > 8192)
        throw invalid('A valid uploaded story URL is required.');
    try {
        const url = new URL(value);
        if (!['https:', 'http:', 'gs:'].includes(url.protocol) || url.username || url.password || url.hash)
            throw new Error();
    }
    catch {
        throw invalid('A valid uploaded story URL is required.');
    }
    return value;
}
export function normalizeStoryPublishInput(value, uid) {
    if (!isRow(value))
        throw invalid('Story details are required.');
    // Required even for old clients: a publish must never select a newer Auth
    // account silently during token retrieval.
    if (value.expectedOwnerUid !== uid)
        throw new HttpsError('failed-precondition', 'Your account changed. Open this story draft again.');
    const allowed = ['requestId', 'expectedOwnerUid', 'authorId', 'mediaUrl', 'mediaType', 'thumbnailUrl', 'caption', 'isCloseFriendsOnly', 'aspectRatio', 'duration', 'pollData'];
    if (Object.keys(value).some(key => !allowed.includes(key)))
        throw invalid('Unsupported story field.');
    if (typeof value.requestId !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(value.requestId))
        throw invalid('A valid story request ID is required.');
    if (value.authorId !== undefined && !id(value.authorId))
        throw invalid('Invalid story author.');
    if (!['image', 'video'].includes(String(value.mediaType)))
        throw invalid('Story media must be an image or video.');
    if (value.isCloseFriendsOnly !== undefined && typeof value.isCloseFriendsOnly !== 'boolean')
        throw invalid('Invalid story audience.');
    if (value.caption != null && (typeof value.caption !== 'string' || value.caption.length > 2200))
        throw invalid('Story captions must be at most 2,200 characters.');
    const aspectRatio = value.aspectRatio ?? 0.5625;
    if (typeof aspectRatio !== 'number' || !Number.isFinite(aspectRatio) || aspectRatio < 0.1 || aspectRatio > 10)
        throw invalid('Invalid story dimensions.');
    const duration = value.duration ?? null;
    if (duration !== null && (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0 || duration > 60))
        throw invalid('Story duration must be at most 60 seconds.');
    let pollData = null;
    if (value.pollData != null) {
        const poll = value.pollData;
        if (!isRow(poll) || !['poll', 'question'].includes(String(poll.type)) || Object.keys(poll).some(key => !['type', 'question', 'options'].includes(key))
            || typeof poll.question !== 'string' || !poll.question.trim() || poll.question.length > 100 || !Array.isArray(poll.options)
            || poll.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 30)
            || (poll.type === 'question' ? poll.options.length !== 0 : poll.options.length < 2 || poll.options.length > 4))
            throw invalid('Invalid story poll or question.');
        pollData = { type: poll.type, question: poll.question.trim(), options: poll.options.map(option => String(option).trim()) };
    }
    return { requestId: value.requestId, expectedOwnerUid: uid, ...(value.authorId === undefined ? {} : { authorId: value.authorId }),
        mediaUrl: mediaUrl(value.mediaUrl), mediaType: value.mediaType, thumbnailUrl: value.thumbnailUrl == null ? null : mediaUrl(value.thumbnailUrl),
        caption: typeof value.caption === 'string' ? value.caption.trim() || null : null, destination: value.isCloseFriendsOnly === true ? 'close_friends' : 'my_story', aspectRatio, duration, pollData };
}
/** Parse only owned Firebase paths; never fetch an arbitrary caller URL. */
export function storyStoragePath(value, uid, bucket, emulatorHost) {
    const url = new URL(value);
    if (url.username || url.password || url.hash)
        throw invalid('Invalid story media URL.');
    let path;
    if (url.protocol === 'gs:') {
        if (url.hostname === bucket)
            path = decodeURIComponent(url.pathname.slice(1));
        else if (['stories', 'chat-media'].includes(url.hostname))
            path = `${url.hostname}/${decodeURIComponent(url.pathname.slice(1))}`;
        else
            throw invalid('Story media must use VYBE storage.');
    }
    else {
        const isEmulator = !!emulatorHost && /^demo-/.test(process.env.GCLOUD_PROJECT || '') && url.protocol === 'http:'
            && (url.host === emulatorHost || (process.env.GCLOUD_PROJECT === 'demo-vybe-preview' && url.host === '127.0.0.1:8082'));
        if (!(url.protocol === 'https:' && url.hostname === 'firebasestorage.googleapis.com' && !url.port) && !isEmulator)
            throw invalid('Story media must use VYBE storage.');
        const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
        if (!match || decodeURIComponent(match[1]) !== bucket)
            throw invalid('Story media must use VYBE storage.');
        path = decodeURIComponent(match[2]);
    }
    const parts = path.split('/');
    if (!['stories', 'chat-media'].includes(parts[0]) || parts[1] !== uid || parts.length < 3 || parts.some(part => !part || part === '.' || part === '..'))
        throw new HttpsError('permission-denied', 'Story media must belong to your account.');
    return path;
}
export async function verifyStoryUploads(input, uid) {
    const bucket = getStorage().bucket();
    const verify = async (url, kind) => {
        let path;
        try {
            path = storyStoragePath(url, uid, bucket.name, process.env.FIREBASE_STORAGE_EMULATOR_HOST);
        }
        catch (error) {
            if (error instanceof HttpsError)
                throw error;
            throw invalid('Invalid story upload URL.');
        }
        let metadata;
        try {
            [metadata] = await bucket.file(path).getMetadata();
        }
        catch {
            throw new HttpsError('failed-precondition', 'The story upload is unavailable. Upload the media again.');
        }
        const size = Number(metadata.size);
        if (!Number.isSafeInteger(size) || size < 1 || size >= 50 * 1024 * 1024 || typeof metadata.contentType !== 'string' || !metadata.contentType.startsWith(`${kind}/`))
            throw invalid('The uploaded story media has an unsupported type or size.');
    };
    await verify(input.mediaUrl, input.mediaType);
    if (input.thumbnailUrl)
        await verify(input.thumbnailUrl, 'image');
}
export async function publishStoryWithReceipt(database, uid, raw, verifyUploads = verifyStoryUploads, nowMs = Date.now()) {
    const input = normalizeStoryPublishInput(raw, uid);
    const key = storyRequestKey(uid, input.requestId, input.destination);
    const storyId = `story_${key}`;
    const receiptRef = database.collection('_story_publish_receipts').doc(key);
    const storyRef = database.collection('stories').doc(storyId);
    const quotaRef = database.collection('_story_publish_limits').doc(digest(uid));
    const fingerprint = digest([input.mediaUrl, input.mediaType, input.thumbnailUrl, input.caption, input.destination, input.aspectRatio, input.duration, input.pollData]);
    const response = { success: true, storyId, ownerUid: uid, requestId: input.requestId, destination: input.destination };
    // A replay needs the retained receipt, not an upload that may now have been
    // deleted. If the receipt disappears between reads, fail instead of creating.
    const existing = await receiptRef.get();
    if (!existing.exists)
        await verifyUploads(input, uid);
    if (!Number.isSafeInteger(nowMs) || nowMs < 0)
        throw unavailable();
    const now = new Date(nowMs).toISOString();
    const day = now.slice(0, 10);
    return database.runTransaction(async (tx) => {
        const [receiptSnap, storySnap, profiles, index, quotaSnap] = await Promise.all([
            tx.get(receiptRef), tx.get(storyRef), tx.get(database.collection('profiles').where('user_id', '==', uid).limit(2)),
            tx.get(database.collection('user_auth_index').doc(uid)), tx.get(quotaRef),
        ]);
        if (profiles.size !== 1)
            throw new HttpsError('failed-precondition', 'Your story author could not be verified. Refresh your profile and try again.');
        const profile = profiles.docs[0];
        const profileRow = profile.data();
        if (profileRow.deleted_at || profileRow.is_deleted === true || (index.exists && index.data()?.profile_id !== profile.id)
            || (input.authorId !== undefined && input.authorId !== profile.id))
            throw new HttpsError('failed-precondition', 'Your story author changed. Open this story draft again.');
        if (profile.id !== uid) {
            const [uidProfile, aliasUidProfiles] = await Promise.all([tx.get(database.collection('profiles').doc(uid)), tx.get(database.collection('profiles').where('user_id', '==', profile.id).limit(1))]);
            if ((uidProfile.exists && uidProfile.data()?.user_id !== uid) || !aliasUidProfiles.empty)
                throw new HttpsError('failed-precondition', 'Your story author identity is ambiguous. Contact support.');
        }
        const author = { id: profile.id, username: typeof profileRow.username === 'string' ? profileRow.username : '', avatar_url: typeof profileRow.avatar_url === 'string' ? profileRow.avatar_url : null, display_name: typeof profileRow.display_name === 'string' ? profileRow.display_name : null };
        if (receiptSnap.exists) {
            const receipt = receiptSnap.data();
            if (receipt.version !== 1 || receipt.owner_uid !== uid || receipt.profile_id !== profile.id || receipt.story_id !== storyId
                || receipt.request_id !== input.requestId || receipt.destination !== input.destination || !Number.isSafeInteger(receipt.expires_at_ms))
                throw unavailable();
            if (receipt.fingerprint !== fingerprint)
                throw new HttpsError('already-exists', 'This story request was already used for different content. Start a new story draft.');
            if (receipt.expires_at_ms <= nowMs)
                return { ...response, status: 'expired', created: false, story: null };
            if (!storySnap.exists)
                return { ...response, status: 'deleted', created: false, story: null };
            const story = storySnap.data();
            if (story.is_deleted === true || story.deleted_at)
                return { ...response, status: 'deleted', created: false, story: null };
            if (story.author_id !== profile.id || story.publish_receipt_id !== key || story.expires_at !== new Date(receipt.expires_at_ms).toISOString())
                throw unavailable();
            return { ...response, status: 'published', created: false, story: { ...story, id: storyId, author } };
        }
        if (existing.exists || storySnap.exists)
            throw unavailable();
        const quota = quotaSnap.data();
        if (quota && (quota.version !== 1 || quota.owner_uid !== uid || !Number.isSafeInteger(quota.count) || quota.count < 0 || typeof quota.day !== 'string'))
            throw unavailable();
        const count = quota?.day === day ? quota.count : 0;
        if (count >= STORY_DAILY_LIMIT)
            throw new HttpsError('resource-exhausted', 'Daily story limit reached. Try again tomorrow.');
        const expiresAtMs = nowMs + STORY_LIFETIME_MS;
        const story = { id: storyId, author_id: profile.id, media_url: input.mediaUrl, media_type: input.mediaType, thumbnail_url: input.thumbnailUrl,
            caption: input.caption, is_close_friends_only: input.destination === 'close_friends', aspect_ratio: input.aspectRatio, duration: input.duration,
            poll_data: input.pollData, view_count: 0, created_at: now, expires_at: new Date(expiresAtMs).toISOString(), publish_receipt_id: key };
        tx.create(storyRef, story);
        tx.create(receiptRef, { version: 1, owner_uid: uid, profile_id: profile.id, story_id: storyId, request_id: input.requestId, destination: input.destination, fingerprint, created_at: now, expires_at_ms: expiresAtMs });
        tx.set(quotaRef, { version: 1, owner_uid: uid, day, count: count + 1, updated_at: now });
        return { ...response, status: 'published', created: true, story: { ...story, author } };
    });
}
//# sourceMappingURL=storyPublishAuthority.js.map