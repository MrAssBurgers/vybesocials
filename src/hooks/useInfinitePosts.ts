import { useSocialFeed } from './useSocialFeed';
import { useSocialPostList } from './useSocialPostList';

export interface Post {
  id: string;
  type: string;
  age_rating?: 'safe' | '13+' | '18+' | 'unrated';
  media_url: string;
  media_urls?: string[];
  is_ai_generated?: boolean;
  ai_confidence?: number;
  ai_override?: boolean | null;
  publication_revision?: string;
  needs_owner_confirmation?: boolean;
  thumbnail_url: string | null;
  caption: string;
  tags: string[];
  created_at: string;
  is_pinned: boolean;
  author: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  reaction_type?: string | null;
  view_count?: number;
}

export function useInfinitePosts(type?: 'short' | 'post' | 'video', authorId?: string, options?: { enabled?: boolean }) {
  const profile = useSocialPostList({ scope: 'profile', targetId: authorId, ...(type ? { contentType: type } : {}) }, !!authorId && options?.enabled !== false, { includeCommentCounts: false });
  const feed = useSocialFeed(type, !authorId && options?.enabled !== false);
  return authorId ? { ...profile, data: profile.data ? { pages: [{ posts: profile.data, nextCursor: null }], pageParams: [undefined] } : undefined } : feed;
}
export function useInfiniteFollowingPosts(type?: 'short' | 'post' | 'video', options?: { enabled?: boolean }) {
  return useSocialFeed(type, options?.enabled !== false, 'following');
}
export function usePersonalizedFeed(type?: 'short' | 'post' | 'video', options?: { enabled?: boolean }) {
  return useSocialFeed(type, options?.enabled !== false, 'personalized');
}
