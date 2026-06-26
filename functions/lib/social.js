import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth } from './_shared/admin.js';
/** share-preview — public HTTP renderer for shared post links (OG tags). */
export const sharePreview = onRequest({ cors: true }, async (req, res) => {
    if (req.method === 'GET' && (req.query.probe === '1' || req.query.health === '1')) {
        res.status(200).json({ ok: true, fn: 'sharePreview' });
        return;
    }
    const postId = req.query.postId || (req.path.split('/').pop() || '');
    if (!postId) {
        res.status(400).send('postId required');
        return;
    }
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) {
        res.status(404).send('not found');
        return;
    }
    const post = doc.data();
    const title = (post.title || 'A post on VYBE').slice(0, 80);
    const desc = (post.caption || '').slice(0, 160);
    const image = post.cover_url || post.media_url || 'https://vybehub.app/og-default.png';
    res.set('Content-Type', 'text/html').send(`<!doctype html><html><head>
<meta charset="utf-8"/><title>${title}</title>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:image" content="${image}"/>
<meta property="og:url" content="https://vybehub.app/post/${postId}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta http-equiv="refresh" content="0; url=https://vybehub.app/post/${postId}"/>
</head><body><a href="https://vybehub.app/post/${postId}">Open in VYBE</a></body></html>`);
});
/** get-ranked-feed — engagement-weighted recent posts. */
export const getRankedFeed = onCall(async (request) => {
    requireAuth(request);
    const { limit = 50, mode = 'explore' } = (request.data || {});
    const snap = await db.collection('posts').orderBy('created_at', 'desc').limit(Math.min(Number(limit), 100)).get();
    const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Engagement score: shares 5, saves 4, comments 3, likes 1, views 0.1
    const scored = posts.map((p) => ({
        ...p,
        _score: (p.share_count || 0) * 5 + (p.save_count || 0) * 4 + (p.comment_count || 0) * 3 + (p.like_count || 0) + (p.view_count || 0) * 0.1,
    }));
    if (mode !== 'recent')
        scored.sort((a, b) => b._score - a._score);
    return { posts: scored };
});
/** calculate-feed-ranking — recompute denormalized score on a post. */
export const calculateFeedRanking = onCall(async (request) => {
    requireAuth(request);
    const { postId } = (request.data || {});
    if (!postId)
        throw new HttpsError('invalid-argument', 'postId required');
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists)
        throw new HttpsError('not-found', 'post not found');
    const p = doc.data();
    const score = (p.share_count || 0) * 5 + (p.save_count || 0) * 4 + (p.comment_count || 0) * 3 + (p.like_count || 0) + (p.view_count || 0) * 0.1;
    await doc.ref.update({ engagement_score: score, ranked_at: new Date().toISOString() });
    return { score };
});
/** get-recommendations — simple recent posts in user's interests. */
export const getRecommendations = onCall(async (request) => {
    const uid = requireAuth(request);
    const profile = (await db.collection('profiles').doc(uid).get()).data() || {};
    const interests = (profile.interests || profile.onboarding_interests || []).slice(0, 5);
    if (!interests.length) {
        const snap = await db.collection('posts').orderBy('created_at', 'desc').limit(20).get();
        return { posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
    }
    const snap = await db.collection('posts').where('tags', 'array-contains-any', interests).orderBy('created_at', 'desc').limit(20).get();
    return { posts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
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