import { memo, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Circle, Film, Grid, Play, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePosts } from '@/hooks/usePosts';
import { useSharedWithFriend } from '@/hooks/useSharedWithFriend';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';

type ContentTab = 'posts' | 'clips' | 'stories' | 'shared';

interface SocialProfileContentProps {
  profileId: string;
  isFriend: boolean;
  visibility?: Record<string, boolean> | null;
}

export const SocialProfileContent = memo(function SocialProfileContent({
  profileId,
  isFriend,
  visibility,
}: SocialProfileContentProps) {
  const reduceMotion = useReducedMotion();
  const { data: allPosts, isLoading } = usePosts(undefined, profileId, {
    enabled: !!profileId,
  });
  const posts = useMemo(
    () =>
      visibility?.posts === false
        ? []
        : (allPosts || []).filter((post) => post.type === 'post' || post.type === 'video'),
    [allPosts, visibility?.posts],
  );
  const clips = useMemo(
    () =>
      visibility?.clips === false
        ? []
        : (allPosts || []).filter((post) => post.type === 'short'),
    [allPosts, visibility?.clips],
  );
  const storiesQuery = useQuery({
    queryKey: ['relationship-profile-stories', profileId],
    queryFn: async () => {
      const { data, error } = await db
        .from('stories')
        .select('id, media_url, thumbnail_url')
        .eq('author_id', profileId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profileId && visibility?.stories !== false,
    staleTime: 30_000,
  });
  const sharedQuery = useSharedWithFriend(isFriend ? profileId : undefined);
  const stories = visibility?.stories === false ? [] : (storiesQuery.data || []);
  const shared = isFriend ? (sharedQuery.data || []) : [];
  const availableTabs = useMemo<ContentTab[]>(
    () => [
      ...(posts.length ? (['posts'] as const) : []),
      ...(clips.length ? (['clips'] as const) : []),
      ...(stories.length ? (['stories'] as const) : []),
      ...(shared.length ? (['shared'] as const) : []),
    ],
    [posts.length, clips.length, stories.length, shared.length],
  );
  const [activeTab, setActiveTab] = useState<ContentTab>('posts');

  useEffect(() => {
    if (!availableTabs.includes(activeTab) && availableTabs[0]) {
      setActiveTab(availableTabs[0]);
    }
  }, [activeTab, availableTabs]);

  if (isLoading || storiesQuery.isLoading || (isFriend && sharedQuery.isLoading)) {
    return (
      <div className="grid grid-cols-3 gap-1.5" aria-label="Loading profile posts">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  if (!availableTabs.length) return null;
  const items = activeTab === 'posts' ? posts : clips;

  return (
    <section className="space-y-3">
      {availableTabs.length > 1 && (
        <div className="flex gap-1 rounded-2xl border border-border/30 bg-card/70 p-1">
          {availableTabs.map((tab) => {
            const Icon =
              tab === 'posts'
                ? Grid
                : tab === 'clips'
                  ? Film
                  : tab === 'stories'
                    ? Circle
                    : Share2;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors',
                  activeTab === tab
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab[0].toUpperCase() + tab.slice(1)}
              </button>
            );
          })}
        </div>
      )}

      <motion.div
        key={activeTab}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.18 }}
      >
        {(activeTab === 'posts' || activeTab === 'clips') && (
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((post) => (
              <Link
                key={post.id}
                to={activeTab === 'clips' ? `/clips/${post.id}` : `/p/${post.id}`}
                className={cn(
                  'relative overflow-hidden rounded-xl bg-muted ring-1 ring-border/10',
                  activeTab === 'clips' ? 'aspect-[9/16]' : 'aspect-square',
                )}
              >
                {post.type === 'video' || post.type === 'short' ? (
                  <>
                    <VideoThumbnail
                      videoUrl={post.media_url}
                      thumbnailUrl={post.thumbnail_url}
                      alt={post.caption || 'Video'}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-black/50 p-1.5">
                      <Play className="h-3 w-3 text-white" fill="currentColor" />
                    </span>
                  </>
                ) : post.media_url ? (
                  <img
                    src={post.media_url}
                    alt={post.caption || ''}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </Link>
            ))}
          </div>
        )}

        {activeTab === 'stories' && (
          <div className="flex gap-2 overflow-x-auto">
            {stories.map((story) => (
              <img
                key={story.id}
                src={story.thumbnail_url || story.media_url}
                alt=""
                className="aspect-[9/16] w-24 shrink-0 rounded-xl object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {activeTab === 'shared' && (
          <div className="space-y-2">
            {shared.map((item) => (
              <Link
                key={item.id}
                to={
                  item.content_type === 'post'
                    ? `/p/${item.content_id}`
                    : `/clips/${item.content_id}`
                }
                className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/70 p-3"
              >
                {item.thumbnail_url ? (
                  <img
                    src={item.thumbnail_url}
                    alt=""
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <Share2 className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="min-w-0 truncate text-sm font-medium">
                  {item.title || `${item.content_type} shared`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </section>
  );
});
