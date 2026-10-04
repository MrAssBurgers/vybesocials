const moods = { like: 'general', love: 'heartwarming', care: 'supportive', haha: 'funny', wow: 'shocking', sad: 'emotional', angry: 'controversial' };
/** Ranking changes order only after audience admission. It never grants access. */
export function rankSocialPosts(posts, reactions, signals) {
    const weights = { general: 1, heartwarming: 1, supportive: 0, funny: 0, shocking: 0, emotional: 0, controversial: 0 };
    const seen = new Set();
    for (const row of reactions) {
        if (typeof row.post_id !== 'string' || seen.has(row.post_id) || typeof row.reaction_type !== 'string' || !Object.hasOwn(moods, row.reaction_type))
            continue;
        seen.add(row.post_id);
        weights[moods[row.reaction_type]]++;
    }
    const ids = new Set(posts.map(post => post.id));
    const matches = new Map();
    for (const row of signals) {
        if (typeof row.post_id !== 'string' || !ids.has(row.post_id) || typeof row.mood !== 'string' || !Object.hasOwn(weights, row.mood)
            || typeof row.signal_strength !== 'number' || !Number.isFinite(row.signal_strength) || row.signal_strength < 0)
            continue;
        matches.set(row.post_id, (matches.get(row.post_id) ?? 0) + Math.min(row.signal_strength, 1_000_000) * weights[row.mood]);
    }
    const score = (post) => post.likeCount * 2 + post.commentCount * 3 + post.viewCount * 0.1 + (matches.get(post.id) ?? 0) * 2;
    return [...posts].sort((a, b) => score(b) - score(a));
}
//# sourceMappingURL=socialFeedRanking.js.map