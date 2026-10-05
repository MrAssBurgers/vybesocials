import { useSocialFeed } from './useSocialFeed';
import { approximateLocalArea } from '@/lib/localArea';
import { useMutation } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface RankedFeedOptions {
  contentType?: 'short' | 'post' | 'video' | null;
  category?: string | null;
  lat?: number | null;
  lng?: number | null;
  radiusMiles?: number | null;
}

export function useRankedFeed(opts: RankedFeedOptions = {}) {
  const area = typeof opts.lat === 'number' && typeof opts.lng === 'number' ? approximateLocalArea(opts.lat, opts.lng) : undefined;
  const query = useSocialFeed(opts.contentType ?? undefined, true, area ? 'local' : 'personalized', area);
  return { ...query, data: query.data && opts.category ? { ...query.data, pages: query.data.pages.map(page => ({ ...page,
    posts: page.posts.filter(post => post.tags.some(tag => tag.toLowerCase().includes(opts.category!.toLowerCase()))) })) } : query.data };
}

/**
 * Record a ranking-affecting interaction (skip, complete, rewatch, report,
 * follow_creator, profile_tap). Idempotent per (user, post, type) thanks to
 * the unique constraint on user_interactions.
 */
export function useRecordRankingSignal() {
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({
      postId,
      type,
      durationSeconds = 0,
    }: {
      postId: string;
      type: 'skip' | 'complete' | 'rewatch' | 'report' | 'follow_creator' | 'profile_tap';
      durationSeconds?: number;
    }) => {
      if (!profile?.id) return;
      const { error } = await db.from('user_interactions').upsert(
        {
          user_id: profile.id,
          post_id: postId,
          interaction_type: type,
          duration_seconds: durationSeconds,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,post_id,interaction_type' },
      );
      if (error) throw error;
    },
  });
}

/** Bump impression count atomically. Fire when a post enters the viewport. */
export function bumpImpression(postId: string) {
  return db.rpc('bump_post_impression', { p_post_id: postId } as any);
}
