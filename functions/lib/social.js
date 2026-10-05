import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
import { resolveIdentity, validAudienceId } from './_shared/profileAudienceAuthority.js';
import { admitSocialPost, readPublicSocialPost, readSocialFeedPage } from './_shared/socialFeedAuthority.js';
function escapeHtml(input) {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function safeImageUrl(url, fallback) {
    const s = String(url ?? '').trim();
    if (/^https:\/\/[^\s"'<>]+$/i.test(s))
        return s;
    return fallback;
}
/** share-preview — public HTTP renderer for shared post links (OG tags). */
export const sharePreview = onRequest({ cors: true }, async (req, res) => {
    if (req.method === 'GET' && (req.query.probe === '1' || req.query.health === '1')) {
        res.status(200).json({ ok: true, fn: 'sharePreview' });
        return;
    }
    const rawId = req.query.postId || (req.path.split('/').pop() || '');
    const postId = rawId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
    if (!postId) {
        res.status(400).send('postId required');
        return;
    }
    res.set('Cache-Control', 'no-store');
    const post = await readPublicSocialPost(db, postId);
    if (!post) {
        res.status(404).send('not found');
        return;
    }
    const title = escapeHtml('A post on VYBE');
    const desc = escapeHtml((post.caption || '').slice(0, 160));
    const image = escapeHtml(safeImageUrl(post.thumbnailUrl || post.mediaUrl, 'https://vybehub.app/og-default.png'));
    const safePostId = encodeURIComponent(postId);
    res.set('Content-Type', 'text/html').send(`<!doctype html><html><head>
<meta charset="utf-8"/><title>${title}</title>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:image" content="${image}"/>
<meta property="og:url" content="https://vybehub.app/p/${safePostId}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta http-equiv="refresh" content="0; url=https://vybehub.app/p/${safePostId}"/>
</head><body><a href="https://vybehub.app/p/${safePostId}">Open in VYBE</a></body></html>`);
});
async function legacyAdmittedFeed(uid, personalized, limit = 20) {
    const viewer = await db.runTransaction(tx => resolveIdentity(db, tx, uid));
    if (!viewer || viewer.uid !== uid)
        throw new HttpsError('failed-precondition', 'Finish setting up your profile.');
    const requested = Number(limit);
    if (!Number.isSafeInteger(requested) || requested < 1 || requested > 100)
        throw new HttpsError('invalid-argument', 'Choose between one and one hundred posts.');
    const posts = [];
    let cursor;
    for (let pageIndex = 0; pageIndex < Math.ceil(requested / 20); pageIndex++) {
        const result = await readSocialFeedPage(db, uid, { expectedOwnerUid: uid, expectedProfileId: viewer.profileId, feed: personalized ? 'personalized' : 'discover', ...(cursor ? { cursor } : {}) });
        posts.push(...result.posts.map(post => ({ id: post.id, author_id: post.author.id, type: post.type, caption: post.caption, tags: post.tags,
            media_url: post.mediaUrl, thumbnail_url: post.thumbnailUrl, created_at: post.createdAt, like_count: post.likeCount, comment_count: post.commentCount,
            view_count: post.viewCount, author: { id: post.author.id, username: post.author.username, avatar_url: post.author.avatarUrl } })));
        cursor = result.nextCursor ?? undefined;
        if (!cursor)
            break;
    }
    return { posts: posts.slice(0, requested) };
}
/** Compatibility endpoints use the same admission as the current feed. */
export const getRankedFeed = onCall(async (request) => legacyAdmittedFeed(requireAuth(request), request.data?.mode !== 'recent', request.data?.limit ?? 50));
export const getRecommendations = onCall(async (request) => legacyAdmittedFeed(requireAuth(request), true));
/** Owners may refresh their own admitted post's presentation score. */
export const calculateFeedRanking = onCall(async (request) => {
    const uid = requireAuth(request), postId = request.data?.postId;
    if (!validAudienceId(postId))
        throw new HttpsError('invalid-argument', 'postId required');
    return db.runTransaction(async (tx) => {
        const viewer = await resolveIdentity(db, tx, uid);
        if (!viewer || viewer.uid !== uid)
            throw new HttpsError('failed-precondition', 'Your profile changed.');
        const post = await admitSocialPost(db, tx, viewer, postId);
        if (!post || post.author.id !== viewer.profileId)
            throw new HttpsError('permission-denied', 'This post is unavailable.');
        const score = post.commentCount * 3 + post.likeCount + post.viewCount * 0.1;
        tx.update(db.collection('posts').doc(postId), { engagement_score: score, ranked_at: new Date().toISOString() });
        return { score };
    });
});
/** create-group — group conversation. */
export const createGroup = onCall(async (request) => {
    const uid = requireAuth(request);
    const { name, memberIds = [] } = (request.data || {});
    if (!Array.isArray(memberIds) || memberIds.length < 1)
        throw new HttpsError('invalid-argument', 'memberIds required');
    const ref = await db.collection('conversations').add({
        name: name || null,
        type: 'group',
        created_by: uid,
        member_ids: Array.from(new Set([uid, ...memberIds])),
        created_at: new Date().toISOString(),
    });
    const batch = db.batch();
    for (const m of new Set([uid, ...memberIds])) {
        batch.set(ref.collection('members').doc(m), { user_id: m, joined_at: new Date().toISOString() });
    }
    await batch.commit();
    return { conversationId: ref.id };
});
/** unsend-message — soft-delete a message you own. */
export const unsendMessage = onCall(async (request) => {
    const uid = requireAuth(request);
    const { conversationId, messageId } = (request.data || {});
    if (!conversationId || !messageId)
        throw new HttpsError('invalid-argument', 'conversationId & messageId required');
    const ref = db.collection('conversations').doc(conversationId).collection('messages').doc(messageId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new HttpsError('not-found', 'message not found');
    if (snap.data().sender_id !== uid)
        throw new HttpsError('permission-denied', 'not your message');
    await ref.update({ deleted: true, deleted_at: new Date().toISOString(), text: null, media_url: null });
    return { ok: true };
});
/** confirm-referral — credit a referral once. */
export const confirmReferral = onCall(async (request) => {
    const uid = requireAuth(request);
    const { code } = (request.data || {});
    if (!code)
        throw new HttpsError('invalid-argument', 'code required');
    const ref = db.collection('referrals').doc(`${uid}_${code}`);
    if ((await ref.get()).exists)
        return { ok: true, alreadyApplied: true };
    await ref.set({ user_id: uid, code, redeemed_at: new Date().toISOString() });
    return { ok: true };
});
/** calculate-earnings — sum tips & subscriptions for a creator. */
export const calculateEarnings = onCall(async (request) => {
    const uid = requireAuth(request);
    const snap = await db.collection('creator_earnings').where('creator_id', '==', uid).get();
    const total = snap.docs.reduce((acc, d) => acc + (d.data().amount_cents || 0), 0);
    return { total_cents: total, count: snap.size };
});
/** rate-sticker-content — log rating; admin moderates separately. */
export const rateStickerContent = onCall(async (request) => {
    const uid = requireAuth(request);
    const { stickerId, rating } = (request.data || {});
    if (!stickerId)
        throw new HttpsError('invalid-argument', 'stickerId required');
    await db.collection('sticker_ratings').doc(`${uid}_${stickerId}`).set({
        user_id: uid, sticker_id: stickerId, rating: Number(rating) || 0, created_at: new Date().toISOString(),
    });
    return { ok: true };
});
/** giphy-search — proxy for Giphy; returns empty when GIPHY_API_KEY secret is unset. */
export const giphySearch = onCall({ secrets: ['GIPHY_API_KEY'] }, async (request) => {
    requireAuth(request);
    const key = process.env.GIPHY_API_KEY;
    const { query, endpoint = 'search', limit = 30, offset = 0, rating = 'pg-13', } = (request.data || {});
    if (!key)
        return { results: [], next: 0 };
    const lim = Math.min(Math.max(Number(limit) || 30, 1), 50);
    const off = Math.max(Number(offset) || 0, 0);
    const ratingRaw = typeof rating === 'string' ? rating.toLowerCase() : 'pg-13';
    const safeRating = ['g', 'pg', 'pg-13', 'r'].includes(ratingRaw) ? ratingRaw : 'pg-13';
    const params = new URLSearchParams({
        api_key: key,
        limit: String(lim),
        offset: String(off),
        rating: safeRating,
        bundle: 'messaging_non_clips',
    });
    const ep = endpoint === 'trending' ? 'trending' : 'search';
    if (ep === 'search') {
        const q = typeof query === 'string' ? query.trim() : '';
        if (!q)
            return { results: [], next: 0 };
        params.set('q', q.slice(0, 100));
        params.set('lang', 'en');
    }
    try {
        const res = await fetch(`https://api.giphy.com/v1/gifs/${ep}?${params.toString()}`);
        if (!res.ok)
            return { results: [], next: 0 };
        const data = await res.json();
        const items = Array.isArray(data?.data) ? data.data : [];
        const results = items.map((g) => {
            const imgs = (g.images || {});
            const original = imgs.original?.url || '';
            const fixedHeight = imgs.fixed_height?.url || imgs.fixed_height_small?.url || original;
            const preview = imgs.fixed_height_small?.url || imgs.preview_gif?.url || fixedHeight;
            return {
                id: String(g.id),
                title: g.title || '',
                url: original,
                previewUrl: preview,
                mediumUrl: fixedHeight,
            };
        });
        const pagination = data?.pagination || {};
        const next = Number(pagination.offset || 0) + Number(pagination.count || results.length);
        return { results, next };
    }
    catch {
        return { results: [], next: 0 };
    }
});
/** fetch-pixabay-sounds — proxy. */
export const fetchPixabaySounds = onCall({ secrets: ['PIXABAY_API_KEY'] }, async (request) => {
    requireAuth(request);
    const key = process.env.PIXABAY_API_KEY;
    if (!key)
        return { sounds: [] };
    const { query = '' } = (request.data || {});
    const res = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}`);
    if (!res.ok)
        throw new HttpsError('internal', `Pixabay ${res.status}`);
    return res.json();
});
//# sourceMappingURL=social.js.map