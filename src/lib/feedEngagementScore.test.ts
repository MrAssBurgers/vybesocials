import { describe, expect, it } from 'vitest';
import { calculateEngagementScore, type ScorablePost } from '@/lib/feedEngagementScore';

const NOW = new Date('2026-07-01T12:00:00.000Z').getTime();

function post(overrides: Partial<ScorablePost> = {}): ScorablePost {
  return {
    id: 'post-1',
    created_at: new Date(NOW).toISOString(),
    like_count: 0,
    comment_count: 0,
    view_count: 0,
    share_count: 0,
    save_count: 0,
    author: { id: 'creator-1' },
    ...overrides,
  };
}

const noInteractions = new Map();

describe('calculateEngagementScore', () => {
  it('gives a fresh post with no engagement the base score', () => {
    expect(calculateEngagementScore(post(), noInteractions, 0, NOW)).toBe(100);
  });

  it('weights shares > saves > comments > likes > views', () => {
    const base = calculateEngagementScore(post(), noInteractions, 0, NOW);
    const withLike = calculateEngagementScore(post({ like_count: 1 }), noInteractions, 0, NOW);
    const withComment = calculateEngagementScore(post({ comment_count: 1 }), noInteractions, 0, NOW);
    const withSave = calculateEngagementScore(post({ save_count: 1 }), noInteractions, 0, NOW);
    const withShare = calculateEngagementScore(post({ share_count: 1 }), noInteractions, 0, NOW);
    const withView = calculateEngagementScore(post({ view_count: 1 }), noInteractions, 0, NOW);

    expect(withLike - base).toBeCloseTo(1);
    expect(withComment - base).toBeCloseTo(3);
    expect(withSave - base).toBeCloseTo(4);
    expect(withShare - base).toBeCloseTo(5);
    expect(withView - base).toBeCloseTo(0.1);
  });

  it('decays with age but never below the 30% floor', () => {
    const fresh = calculateEngagementScore(post(), noInteractions, 0, NOW);
    const threeDaysOld = calculateEngagementScore(
      post({ created_at: new Date(NOW - 3 * 24 * 3600_000).toISOString() }),
      noInteractions,
      0,
      NOW,
    );
    const monthOld = calculateEngagementScore(
      post({ created_at: new Date(NOW - 30 * 24 * 3600_000).toISOString() }),
      noInteractions,
      0,
      NOW,
    );

    expect(threeDaysOld).toBeLessThan(fresh);
    expect(threeDaysOld).toBeGreaterThan(monthOld - 1e-9);
    // 30% floor: a very old post keeps 30 of the base 100.
    expect(monthOld).toBeCloseTo(30);
  });

  it('boosts creators the user has interacted with', () => {
    const interactions = new Map([['creator-1', { likes: 2, comments: 1, saves: 1 }]]);
    const boosted = calculateEngagementScore(post(), interactions, 0, NOW);
    // 100 × 1.3 × 1.4 × 1.5
    expect(boosted).toBeCloseTo(100 * 1.3 * 1.4 * 1.5);
  });

  it('applies the DNA feed boost percent', () => {
    expect(calculateEngagementScore(post(), noInteractions, 25, NOW)).toBeCloseTo(125);
  });

  it('heavily penalizes not-interested content', () => {
    const interactions = new Map<string, number>([['not_interested_post-1', 1]]);
    expect(calculateEngagementScore(post(), interactions, 0, NOW)).toBeCloseTo(10);
  });
});
