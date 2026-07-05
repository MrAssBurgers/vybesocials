/**
 * Feed engagement scoring — pure and dependency-free so ranking behavior
 * is unit-testable and consistent wherever it's applied.
 */

export interface ScorablePost {
  id: string;
  created_at: string;
  like_count?: number | null;
  comment_count?: number | null;
  view_count?: number | null;
  share_count?: number | null;
  save_count?: number | null;
  author: { id: string };
}

export interface CreatorInteractions {
  likes?: number;
  comments?: number;
  saves?: number;
}

const BASE_SCORE = 100;

// Engagement signals weighted: shares > saves > comments > likes > views
const LIKE_WEIGHT = 1;
const COMMENT_WEIGHT = 3;
const VIEW_WEIGHT = 0.1;
const SHARE_WEIGHT = 5;
const SAVE_WEIGHT = 4;

/**
 * Calculate engagement score for ranking.
 * dnaFeedBoostPercent: if the post author has a Creator DNA perk, their posts get boosted.
 */
export function calculateEngagementScore(
  post: ScorablePost,
  userInteractions: Map<string, CreatorInteractions | number>,
  dnaFeedBoostPercent = 0,
  now: number = Date.now(),
): number {
  let score = BASE_SCORE;

  // Recency decay — posts lose up to 70% of their score over 7 days, floored at 30%.
  const ageHours = (now - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  const recencyMultiplier = Math.max(0.3, 1 - (ageHours / (24 * 7)) * 0.7);

  score += (post.like_count || 0) * LIKE_WEIGHT;
  score += (post.comment_count || 0) * COMMENT_WEIGHT;
  score += (post.view_count || 0) * VIEW_WEIGHT;
  score += (post.share_count || 0) * SHARE_WEIGHT;
  score += (post.save_count || 0) * SAVE_WEIGHT;

  score *= recencyMultiplier;

  // Boost posts from creators the user has interacted with positively.
  const creatorInteractions = userInteractions.get(post.author.id) as
    | CreatorInteractions
    | undefined;
  if (creatorInteractions && typeof creatorInteractions === 'object') {
    if ((creatorInteractions.likes ?? 0) > 0) score *= 1.3;
    if ((creatorInteractions.comments ?? 0) > 0) score *= 1.4;
    if ((creatorInteractions.saves ?? 0) > 0) score *= 1.5;
  }

  // DNA Creator Spotlight perk: boost own posts in discovery.
  if (dnaFeedBoostPercent > 0) {
    score *= 1 + dnaFeedBoostPercent / 100;
  }

  // Heavy penalty when the user marked this content "not interested".
  if (userInteractions.get('not_interested_' + post.id)) {
    score *= 0.1;
  }

  return score;
}
