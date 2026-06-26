import { useState, memo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useStories, useCreateStory } from '@/hooks/useStories';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { useIsGuest } from '@/components/auth/GuestAuthPrompt';
import { StoryPoster } from './StoryPoster';
import { computeStoryPosterDimensions, getStoryPosterUrl } from '@/lib/storyUtils';
import { purgeStuckStoryUploads } from '@/lib/storiesCacheSanitize';
import { cn } from '@/lib/utils';

interface StoriesBarProps {
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
}

export const StoriesBar = memo(function StoriesBar({
  colSpan = 2,
  rowSpan = 1,
}: StoriesBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const { isGuest } = useIsGuest();
  const canCreateStory = !authLoading && !!user;
  const { data: storyGroups } = useStories();
  const createStory = useCreateStory();
  const queryClient = useQueryClient();
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [posterSize, setPosterSize] = useState(() =>
    computeStoryPosterDimensions(colSpan, rowSpan),
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      setPosterSize(computeStoryPosterDimensions(colSpan, rowSpan));
      return;
    }
    const update = () => {
      setPosterSize(
        computeStoryPosterDimensions(colSpan, rowSpan, el.clientWidth),
      );
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [colSpan, rowSpan]);

  useEffect(() => {
    if (!storyGroups || storyGroups.length === 0) return;
    const urls = storyGroups.flatMap((group) => {
      const latest = group.stories[0];
      const poster = latest ? getStoryPosterUrl(latest) : null;
      return [poster, group.user.avatar_url].filter(Boolean) as string[];
    });
    if (urls.length > 0) {
      batchSignUrls(urls).catch(() => {});
    }
  }, [storyGroups]);

  const ownStoryGroup = storyGroups?.find((g) => g.user.id === profile?.id);
  const ownStoryUploading = ownStoryGroup?.stories.some((s) => s.isUploading || s.isOptimistic) ?? false;
  const otherGroups = storyGroups?.filter((g) => g.user.id !== profile?.id) || [];

  // Clear orphaned "Posting…" state from failed uploads or persisted cache.
  useEffect(() => {
    if (!ownStoryUploading || createStory.isPending) return;
    const timer = window.setTimeout(() => {
      purgeStuckStoryUploads(queryClient, profile?.id);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ownStoryUploading, createStory.isPending, profile?.id, queryClient]);

  useEffect(() => {
    if (!createStory.isPending) return;
    const timer = window.setTimeout(() => {
      createStory.reset();
      purgeStuckStoryUploads(queryClient, profile?.id);
      toast.error('Story upload timed out. You can try again.');
    }, 90000);
    return () => window.clearTimeout(timer);
  }, [createStory.isPending, createStory, profile?.id, queryClient]);

  const ownPosterUrl = ownStoryGroup?.stories[0]
    ? getStoryPosterUrl(ownStoryGroup.stories[0])
    : null;

  const emptyAvatarInset = 6;

  const promptStorySignIn = () => {
    toast.error('Sign in to post stories');
    navigate('/?mode=login');
  };

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          'flex gap-3 px-3 py-1.5 overflow-x-auto scrollbar-hide w-full min-w-0',
          colSpan === 2 ? 'justify-start' : 'justify-center items-center',
        )}
        data-tutorial="stories"
      >
        <StoryTile
          posterSize={posterSize}
          emptyAvatarInset={emptyAvatarInset}
          posterUrl={ownPosterUrl}
          avatarUrl={isGuest ? undefined : profile?.avatar_url ?? undefined}
          profileId={profile?.id}
          username={isGuest ? 'Guest' : ownStoryGroup?.user.username ?? profile?.username}
          displayName={isGuest ? null : ownStoryGroup?.user.display_name ?? profile?.display_name ?? null}
          label={isGuest ? 'Add Story' : t('stories.yourStory')}
          hasUnviewed={ownStoryGroup?.hasUnviewed}
          hasStory={!!ownStoryGroup}
          isUploading={createStory.isPending || ownStoryUploading}
          themeGradient={ownStoryGroup?.user.equipped_profile_theme ?? undefined}
          showAddButton
          onClick={() => {
            if (authLoading) return;
            if (!canCreateStory) {
              promptStorySignIn();
            } else if (ownStoryGroup) {
              setSelectedGroupIndex(0);
            } else {
              setShowCreator(true);
            }
          }}
          onAddClick={() => {
            if (authLoading) return;
            if (!canCreateStory) {
              promptStorySignIn();
            } else {
              setShowCreator(true);
            }
          }}
        />

        {otherGroups.map((group, index) => {
          const posterUrl = group.stories[0] ? getStoryPosterUrl(group.stories[0]) : null;
          return (
            <StoryTile
              key={group.user.id}
              posterSize={posterSize}
              emptyAvatarInset={emptyAvatarInset}
              posterUrl={posterUrl}
              avatarUrl={group.user.avatar_url}
              username={group.user.username}
              displayName={group.user.display_name}
              themeGradient={group.user.equipped_profile_theme}
              hasUnviewed={group.hasUnviewed}
              hasStory
              onClick={() => setSelectedGroupIndex(ownStoryGroup ? index + 1 : index)}
            />
          );
        })}
      </div>

      <AnimatePresence>
        {selectedGroupIndex !== null && storyGroups && (
          <StoryViewer
            groups={storyGroups}
            initialGroupIndex={selectedGroupIndex}
            onClose={() => setSelectedGroupIndex(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCreator && <StoryCreator onClose={() => setShowCreator(false)} />}
      </AnimatePresence>
    </>
  );
});

interface StoryTileProps {
  posterSize: { width: number; height: number; borderRadius: number };
  emptyAvatarInset?: number;
  posterUrl?: string | null;
  avatarUrl?: string | null;
  profileId?: string | null;
  username?: string;
  displayName?: string | null;
  themeGradient?: string | null;
  label?: string;
  hasUnviewed?: boolean;
  hasStory?: boolean;
  showAddButton?: boolean;
  isUploading?: boolean;
  onClick: () => void;
  onAddClick?: () => void;
}

const StoryTile = memo(function StoryTile({
  posterSize,
  emptyAvatarInset = 6,
  posterUrl,
  avatarUrl,
  profileId,
  username,
  displayName,
  themeGradient,
  label,
  hasUnviewed,
  hasStory,
  showAddButton,
  isUploading,
  onClick,
  onAddClick,
}: StoryTileProps) {
  const signedPosterUrl = useFastSignedUrl(posterUrl);

  const handleAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAddClick?.();
  };

  const resolvedPoster = signedPosterUrl || posterUrl || undefined;

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      className="flex flex-col items-center gap-2 flex-shrink-0 transition-transform"
      style={{ width: posterSize.width + 6 }}
    >
      <div className="relative">
        <StoryPoster
          width={posterSize.width}
          height={posterSize.height}
          borderRadius={posterSize.borderRadius}
          hasUnviewed={!!hasUnviewed}
          hasStory={!!hasStory}
          isUploading={isUploading}
          posterUrl={resolvedPoster}
          fallbackInitial={username}
          themeGradient={themeGradient}
        >
          {!hasStory && (
            <div
              className="absolute inset-0 flex items-center justify-center p-1.5"
              style={{ padding: emptyAvatarInset }}
            >
              <Avatar
                className="h-full w-full border border-background/80 shadow-inner"
                style={{ borderRadius: Math.max(8, posterSize.borderRadius - emptyAvatarInset) }}
              >
                <ProfileAvatarImage
                  profileId={profileId}
                  src={avatarUrl || undefined}
                  transformSize={256}
                  className="object-cover"
                />
                <AvatarFallback className="bg-muted text-muted-foreground text-2xl font-semibold">
                  {username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </StoryPoster>

        {showAddButton && !isUploading && (
          <div
            onClick={handleAddClick}
            className="absolute -bottom-1 -right-1 z-20 bg-accent rounded-full p-1 border-2 border-background cursor-pointer active:scale-95 transition-transform shadow-[0_1px_4px_rgba(0,0,0,0.3)]"
          >
            <Plus className="h-4 w-4 text-accent-foreground" strokeWidth={3} />
          </div>
        )}
      </div>
      <span
        className="text-[11px] font-semibold text-foreground truncate text-center leading-snug min-h-[2rem] flex items-center justify-center drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
        style={{ width: posterSize.width + 4, maxWidth: posterSize.width + 8 }}
      >
        {isUploading ? 'Posting...' : label || displayName || username}
      </span>
    </motion.button>
  );
});
