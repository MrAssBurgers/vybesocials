import { describe, expect, it } from 'vitest';
import { rankSocialPosts } from '../../functions/src/_shared/socialFeedRanking';
const posts = () => [{ id: 'popular', likeCount: 2, commentCount: 0, viewCount: 0 }, { id: 'funny', likeCount: 0, commentCount: 0, viewCount: 0 }];
describe('ranking after audience admission', () => {
  it('keeps engagement discovery and learns a reaction mood without changing admitted membership', () => {
    const source = posts(); const signals = [{ post_id: 'funny', mood: 'funny', signal_strength: 3 }, { post_id: 'private', mood: 'funny', signal_strength: 1000000 }];
    expect(rankSocialPosts(source, [], signals).map(post => post.id)).toEqual(['popular', 'funny']);
    expect(rankSocialPosts(source, [{ post_id: 'past', reaction_type: 'haha' }], signals).map(post => post.id)).toEqual(['funny', 'popular']);
    expect(source.map(post => post.id)).toEqual(['popular', 'funny']);
  });
  it('deduplicates alias reactions and ignores malformed or unknown ranking signals', () => {
    const reactions = [{ post_id: 'past', reaction_type: 'haha' }, { post_id: 'past', reaction_type: 'haha' }];
    const signals = [{ post_id: 'funny', mood: 'funny', signal_strength: 1.5 },
      ...[Infinity, NaN, -100, 'huge'].map(signal_strength => ({ post_id: 'funny', mood: 'funny', signal_strength })),
      { post_id: 'funny', mood: 'unknown', signal_strength: 9999 }];
    expect(rankSocialPosts(posts(), reactions, signals).map(post => post.id)).toEqual(['popular', 'funny']);
  });
});
