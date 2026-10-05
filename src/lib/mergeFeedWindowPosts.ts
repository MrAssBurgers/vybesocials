import type { Post } from '@/hooks/useInfinitePosts';

/** An exhausted source must not repeat its newer posts in the next combined group. */
export function mergeFeedWindowPosts(sources: { windowIndex: number; pages?: { posts?: Post[] }[] }[]): Post[] {
  const currentWindow = Math.max(0, ...sources.map(source => source.windowIndex));
  const seen = new Set<string>();
  return sources.flatMap(source => source.windowIndex === currentWindow ? source.pages?.flatMap(page => page.posts ?? []) ?? [] : [])
    .filter(post => {
      if (!post?.id || !post.author?.id || (post.type !== 'post' && post.type !== 'video') || seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
}
