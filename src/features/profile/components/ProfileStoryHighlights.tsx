import { useMemo, useState } from 'react';
import { ChevronRight, Eye, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StoryViewer } from '@/components/stories/StoryViewer';
import { useStories, type StoryGroup } from '@/hooks/useStories';
import { openSnapCamera } from '@/contexts/cameraOverlayActions';
import { useCameraOverlayOptional } from '@/contexts/cameraOverlaySafe';
import { cn } from '@/lib/utils';
import { useStoryHighlights } from '../hooks/useStoryHighlights';
import { formatProfileStat } from './ProfileCoverHero';

interface ProfileStoryHighlightsProps {
  profileId: string;
  username: string;
  avatarUrl?: string | null;
  isOwnProfile: boolean;
  canViewStories?: boolean;
  className?: string;
}

export function ProfileStoryHighlights({
  profileId,
  username,
  avatarUrl,
  isOwnProfile,
  canViewStories = true,
  className,
}: ProfileStoryHighlightsProps) {
  const navigate = useNavigate();
  const camera = useCameraOverlayOptional();
  const { data: storyGroups } = useStories();
  const { data: highlights = [] } = useStoryHighlights(canViewStories ? profileId : undefined);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const myStoryGroup = useMemo(() => {
    if (!canViewStories || !storyGroups?.length) return null;
    return (
      storyGroups.find((g) => g.user.id === profileId || g.user.username === username) ?? null
    );
  }, [storyGroups, profileId, username, canViewStories]);

  const groupsForViewer: StoryGroup[] = useMemo(
    () => (myStoryGroup ? [myStoryGroup] : []),
    [myStoryGroup],
  );

  const hasCurrentStory = !!myStoryGroup?.stories?.length;
  const itemCount =
    (isOwnProfile ? 1 : 0) +
    (hasCurrentStory ? 1 : 0) +
    highlights.length +
    (hasCurrentStory || highlights.length > 0 ? 1 : 0);

  if (!isOwnProfile && !hasCurrentStory && highlights.length === 0) return null;

  const openAddStory = () => {
    if (!camera?.openCamera) {
      navigate('/upload');
      return;
    }
    openSnapCamera(camera.openCamera, {
      source: 'story',
      defaultDestination: 'story',
      returnRoute: `/u/${encodeURIComponent(username)}`,
    });
  };

  const storyViews = (myStoryGroup?.stories || []).reduce((sum, s) => {
    const v = (s as { view_count?: number }).view_count;
    return sum + (typeof v === 'number' ? v : 0);
  }, 0);

  const compact = itemCount <= 1;

  return (
    <div className={cn('vybe-profile-chrome px-4', compact ? 'py-1' : 'py-0', className)}>
      {!compact && (
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Stories
          </h2>
          {isOwnProfile && (
            <button type="button" onClick={openAddStory} className="text-[11px] font-semibold text-primary">
              + New
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2.5 overflow-x-auto pb-0.5 scrollbar-none">
        {isOwnProfile && (
          <button type="button" className="vybe-profile-story-chip" onClick={openAddStory}>
            <div className="vybe-profile-story-thumb">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <span className="w-full truncate text-center text-[9px] font-medium">Add Story</span>
          </button>
        )}

        {hasCurrentStory && (
          <button
            type="button"
            className="vybe-profile-story-chip"
            onClick={() => setViewerIndex(0)}
          >
            <div
              className={cn(
                'vybe-profile-story-ring',
                !myStoryGroup?.hasUnviewed && 'vybe-profile-story-ring--seen',
              )}
            >
              <Avatar className="h-14 w-14 border-2 border-background">
                <AvatarImage
                  src={
                    myStoryGroup?.stories?.[0]?.thumbnail_url ||
                    myStoryGroup?.stories?.[0]?.media_url ||
                    avatarUrl ||
                    undefined
                  }
                />
                <AvatarFallback className="text-xs">{username.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
            <span className="w-full truncate text-center text-[9px] font-medium">My Story</span>
            {storyViews > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[8px] text-muted-foreground">
                <Eye className="h-2 w-2" />
                {formatProfileStat(storyViews)}
              </span>
            )}
          </button>
        )}

        {highlights.map((h) => (
          <button
            key={h.id}
            type="button"
            className="vybe-profile-story-chip"
            onClick={() => toast.message(h.title, { description: 'Highlight reel coming soon' })}
          >
            <div className="vybe-profile-story-ring vybe-profile-story-ring--seen">
              <Avatar className="h-14 w-14 border-2 border-background">
                <AvatarImage src={h.cover_url || avatarUrl || undefined} />
                <AvatarFallback className="text-xs">{h.title.slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
            <span className="w-full truncate text-center text-[9px] font-medium">{h.title}</span>
          </button>
        ))}

        {(hasCurrentStory || highlights.length > 0) && (
          <button
            type="button"
            className="vybe-profile-story-chip"
            onClick={() => {
              if (hasCurrentStory) setViewerIndex(0);
              else toast.message('Highlights', { description: 'All highlights' });
            }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/50 bg-muted/20">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="w-full truncate text-center text-[9px] font-medium text-muted-foreground">
              See All
            </span>
          </button>
        )}
      </div>

      {viewerIndex !== null && groupsForViewer.length > 0 && (
        <StoryViewer
          groups={groupsForViewer}
          initialGroupIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
