import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useSocialPostList } from '@/hooks/useSocialPostList';
import { PostListReadStatus } from '@/components/posts/PostListReadStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';
import { EmptyState } from '@/components/ui/EmptyState';
import { cn } from '@/lib/utils';
import { formatProfileStat } from './ProfileCoverHero';

type ContentTab = 'posts' | 'clips' | 'tagged';

interface ProfileContentTabsProps {
  profileId: string;
  canViewPosts?: boolean;
  canViewClips?: boolean;
  canViewTagged?: boolean;
  className?: string;
}

export function ProfileContentTabs({
  profileId,
  canViewPosts = false,
  canViewClips = false,
  canViewTagged = false,
  className,
}: ProfileContentTabsProps) {
  const reduceMotion = useReducedMotion();
  const [activeTab, setActiveTab] = useState<ContentTab>('posts');
  const allowed = { posts: canViewPosts, clips: canViewClips, tagged: canViewTagged };
  const content = useSocialPostList({ scope: activeTab === 'tagged' ? 'tagged' : 'profile', targetId: profileId,
    ...(activeTab === 'clips' ? { contentType: 'short' as const } : {}) }, !!profileId && allowed[activeTab]);
  const allPosts = useMemo(() => (content.data || []).filter(row => activeTab !== 'posts' || row.type !== 'short').map(row => ({ ...row, post_id: row.id })), [content.data, activeTab]);
  const posts = canViewPosts && activeTab === 'posts' ? allPosts : [];
  const clips = canViewClips && activeTab === 'clips' ? allPosts : [];
  const tagged = canViewTagged && activeTab === 'tagged' ? allPosts : [];

  const tabs: { id: ContentTab; label: string }[] = [
    { id: 'posts', label: 'Posts' },
    { id: 'clips', label: 'Clips' },
    { id: 'tagged', label: 'Tagged' },
  ];

  useEffect(() => {
    if (!allowed[activeTab]) {
      if (canViewPosts) setActiveTab('posts'); else if (canViewClips) setActiveTab('clips'); else if (canViewTagged) setActiveTab('tagged');
    }
  }, [activeTab, canViewPosts, canViewClips, canViewTagged]);

  if (content.isLoading) {
    return (
      <div className={cn('space-y-2 px-4', className)}>
        <div className="flex gap-6 border-b border-border/30 pb-2">
          {tabs.map((t) => (
            <Skeleton key={t.id} className="h-3 w-12" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 md:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  const emptyCopy: Record<ContentTab, { title: string; description: string }> = {
    posts: { title: 'No posts yet', description: 'Posts will show up here.' },
    clips: { title: 'No clips yet', description: 'Short clips will show up here.' },
    tagged: { title: 'No tagged posts', description: 'Posts you are tagged in will appear here.' },
  };

  const viewsBadge = (count?: number | null) =>
    typeof count === 'number' && count > 0 ? (
      <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[8px] font-medium text-white">
        <Play className="h-2 w-2 fill-current" />
        {formatProfileStat(count)}
      </span>
    ) : null;

  return (
    <section className={cn('vybe-profile-chrome pb-6', className)}>
      <div className="sticky top-0 z-20 border-b border-border/30 bg-[hsl(var(--card)/0.95)] backdrop-blur-sm">
        <div className="flex px-4">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                disabled={!allowed[tab.id]}
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex-1 py-2.5 text-xs font-semibold transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/80',
                )}
              >
                {tab.label}
                {active && (
                  <motion.span
                    layoutId="profile-content-tab-underline"
                    className="vybe-profile-tab-underline"
                    transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <motion.div
        key={activeTab}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.15 }}
        className="px-3 pt-2"
      >
        {!allowed[activeTab] && <EmptyState title="Content not shared" description="This section is not available on this profile." />}
        {content.isError && allowed[activeTab] && <div role="alert" className="py-8 text-center"><p>Content could not be loaded.</p><button type="button" className="min-h-11 text-primary" onClick={() => void content.refetch()}>Retry content</button></div>}
        {allowed[activeTab] && !content.isError && !content.hasNextPage && !content.hasMoreWindow && activeTab === 'posts' && posts.length === 0 && (
          <EmptyState title={emptyCopy.posts.title} description={emptyCopy.posts.description} />
        )}
        {allowed[activeTab] && !content.isError && !content.hasNextPage && !content.hasMoreWindow && activeTab === 'clips' && clips.length === 0 && (
          <EmptyState title={emptyCopy.clips.title} description={emptyCopy.clips.description} />
        )}
        {allowed[activeTab] && !content.isError && !content.hasNextPage && !content.hasMoreWindow && activeTab === 'tagged' && tagged.length === 0 && (
          <EmptyState title={emptyCopy.tagged.title} description={emptyCopy.tagged.description} />
        )}

        {activeTab === 'posts' && posts.length > 0 && (
          <div className="grid grid-cols-3 gap-1 md:grid-cols-4">
            {posts.map((post) => (
              <Link key={post.id} to={`/p/${post.id}`} className="vybe-profile-grid-tile">
                {post.type === 'video' ? (
                  <VideoThumbnail
                    videoUrl={post.media_url}
                    thumbnailUrl={post.thumbnail_url}
                    alt={post.caption || 'Video'}
                    className="h-full w-full object-cover"
                  />
                ) : post.media_url ? (
                  <img
                    src={post.media_url}
                    alt={post.caption || ''}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-1 text-[9px] text-muted-foreground">
                    {(post.caption || '').slice(0, 30)}
                  </div>
                )}
                {viewsBadge(post.view_count)}
              </Link>
            ))}
          </div>
        )}

        {activeTab === 'clips' && clips.length > 0 && (
          <div className="grid grid-cols-3 gap-1 md:grid-cols-4">
            {clips.map((post) => (
              <Link key={post.id} to={`/clips/${post.id}`} className="vybe-profile-grid-tile">
                <VideoThumbnail
                  videoUrl={post.media_url}
                  thumbnailUrl={post.thumbnail_url}
                  alt={post.caption || 'Clip'}
                  className="h-full w-full object-cover"
                />
                {viewsBadge(post.view_count)}
              </Link>
            ))}
          </div>
        )}

        {activeTab === 'tagged' && tagged.length > 0 && (
          <div className="grid grid-cols-3 gap-1 md:grid-cols-4">
            {tagged.map((post) => (
              <Link key={post.id} to={`/p/${post.post_id}`} className="vybe-profile-grid-tile">
                {post.type === 'short' || post.type === 'video' ? (
                  <VideoThumbnail
                    videoUrl={post.media_url || undefined}
                    thumbnailUrl={post.thumbnail_url}
                    alt="Tagged"
                    className="h-full w-full object-cover"
                  />
                ) : post.media_url || post.thumbnail_url ? (
                  <img
                    src={post.thumbnail_url || post.media_url || ''}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
                    Tagged
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
        {allowed[activeTab] && !content.isError && <PostListReadStatus query={content} />}
      </motion.div>
    </section>
  );
}
