import { useState, memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useStories } from '@/hooks/useStories';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { cn } from '@/lib/utils';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import { batchSignUrls } from '@/lib/signedUrlCache';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';
import { StoryRing } from './StoryRing';

export const StoriesBar = memo(function StoriesBar() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { isGuest } = useIsGuest();
  const { data: storyGroups, isLoading } = useStories();
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  // Pre-sign all avatar URLs when stories load.
  // NOTE: This hook must run on every render (no conditional returns before it).
  useEffect(() => {
    if (!storyGroups || storyGroups.length === 0) return;
    const urls = storyGroups.map(g => g.user.avatar_url).filter(Boolean);
    if (urls.length > 0) {
      batchSignUrls(urls).catch(() => {});
    }
  }, [storyGroups]);

  // Never show skeleton - render immediately with whatever data we have (or empty)
  // The preloader already caches stories, so this should be instant

  const ownStoryGroup = storyGroups?.find((g) => g.user.id === profile?.id);
  const otherGroups = storyGroups?.filter((g) => g.user.id !== profile?.id) || [];

  return (
    <>
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide" data-tutorial="stories">
        {/* Add Story Button / Own Story */}
        <StoryAvatar
          avatarUrl={isGuest ? undefined : profile?.avatar_url}
          username={isGuest ? 'Guest' : profile?.username}
          label={isGuest ? 'Add Story' : t('stories.yourStory')}
          hasUnviewed={ownStoryGroup?.hasUnviewed}
          hasStory={!!ownStoryGroup}
          showAddButton={true}
          onClick={() => {
            if (isGuest) {
              setShowAuthPrompt(true);
            } else if (ownStoryGroup) {
              setSelectedGroupIndex(0);
            } else {
              setShowCreator(true);
            }
          }}
          onAddClick={() => {
            if (isGuest) {
              setShowAuthPrompt(true);
            } else {
              setShowCreator(true);
            }
          }}
        />

        {/* Other Users' Stories */}
        {otherGroups.map((group, index) => (
          <StoryAvatar
            key={group.user.id}
            avatarUrl={group.user.avatar_url}
            username={group.user.username}
            displayName={group.user.display_name}
            hasUnviewed={group.hasUnviewed}
            hasStory={true}
            onClick={() => setSelectedGroupIndex(ownStoryGroup ? index + 1 : index)}
          />
        ))}
      </div>

      {/* Story Viewer */}
      <AnimatePresence>
        {selectedGroupIndex !== null && storyGroups && (
          <StoryViewer
            groups={storyGroups}
            initialGroupIndex={selectedGroupIndex}
            onClose={() => setSelectedGroupIndex(null)}
          />
        )}
      </AnimatePresence>

      {/* Story Creator */}
      <AnimatePresence>
        {showCreator && (
          <StoryCreator onClose={() => setShowCreator(false)} />
        )}
      </AnimatePresence>

      {/* Guest Auth Prompt */}
      <GuestAuthPrompt 
        variant="modal"
        action="share stories"
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
      />
    </>
  );
});

interface StoryAvatarProps {
  avatarUrl?: string | null;
  username?: string;
  displayName?: string | null;
  label?: string;
  hasUnviewed?: boolean;
  hasStory?: boolean;
  showAddButton?: boolean;
  isUploading?: boolean;
  onClick: () => void;
  onAddClick?: () => void;
}

const StoryAvatar = memo(function StoryAvatar({ 
  avatarUrl, 
  username, 
  displayName,
  label,
  hasUnviewed, 
  hasStory,
  showAddButton,
  isUploading,
  onClick,
  onAddClick 
}: StoryAvatarProps) {
  const signedUrl = useFastSignedUrl(avatarUrl);

  const handleAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAddClick?.();
  };
  
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform"
    >
      <div className="relative">
        <StoryRing
          hasUnviewed={!!hasUnviewed}
          hasStory={!!hasStory}
          isUploading={isUploading}
        >
          <Avatar className="h-full w-full border-[3px] border-background">
            <AvatarImage src={signedUrl || undefined} className="object-cover" />
            <AvatarFallback className="bg-muted text-muted-foreground text-lg">
              {username?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </StoryRing>
        {showAddButton && !isUploading && (
          <div 
            onClick={handleAddClick}
            className="absolute -bottom-0.5 -right-0.5 z-20 bg-accent rounded-full p-[3px] border-2 border-background cursor-pointer active:scale-95 transition-transform shadow-[0_1px_4px_rgba(0,0,0,0.3)]"
          >
            <Plus className="h-3 w-3 text-accent-foreground" strokeWidth={3} />
          </div>
        )}
      </div>
      <span className="text-[11px] font-semibold text-foreground truncate w-16 text-center leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
        {isUploading ? 'Posting...' : label || displayName || username}
      </span>
    </button>
  );
});
