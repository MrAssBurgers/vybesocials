import { expect, it } from 'vitest';
import type { Post } from '@/hooks/useInfinitePosts';
import { mergeFeedWindowPosts } from './mergeFeedWindowPosts';
const post = (id: string) => ({ id, type: 'post', author: { id: 'author' } } as Post);
it('does not repeat exhausted Following posts when Personalized moves to older posts, and restores them when moving back', () => {
  const following = { windowIndex: 0, pages: [{ posts: [post('friend-new')] }] };
  expect(mergeFeedWindowPosts([following, { windowIndex: 1, pages: [{ posts: [post('older')] }] }]).map(p => p.id)).toEqual(['older']);
  expect(mergeFeedWindowPosts([following, { windowIndex: 0, pages: [{ posts: [post('friend-new'), post('new')] }] }]).map(p => p.id)).toEqual(['friend-new', 'new']);
});
it('does not fill a pending or empty older group with the exhausted newer source', () => {
  const exhausted = { windowIndex: 0, pages: [{ posts: [post('newer')] }] };
  expect(mergeFeedWindowPosts([exhausted, { windowIndex: 1 }])).toEqual([]);
  expect(mergeFeedWindowPosts([{ windowIndex: 1, pages: [{ posts: [] }] }, exhausted])).toEqual([]);
});
