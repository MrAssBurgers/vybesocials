import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useStories } from '@/hooks/useStories';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';

export function StoriesBar() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { data: storyGroups, isLoading } = useStories();
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
  const [showCreator, setShowCreator] = useState(false);

  if (isLoading) {
    return (
      <div className="flex gap-4 p-4 overflow-x-auto scrollbar-hide">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    );
  }

  const ownStoryGroup = storyGroups?.find((g) => g.user.id === profile?.id);
  const otherGroups = storyGroups?.filter((g) => g.user.id !== profile?.id) || [];

  return (
    <>
      <div className="flex gap-3 px-4 py-3 overflow-x-auto scrollbar-hide">
        {/* Add Story Button / Own Story */}
        <StoryAvatar
          avatarUrl={profile?.avatar_url}
          username={profile?.username}
          label={t('stories.yourStory')}
          hasUnviewed={ownStoryGroup?.hasUnviewed}
          hasStory={!!ownStoryGroup}
          showAddButton={true}
          onClick={() => ownStoryGroup ? setSelectedGroupIndex(0) : setShowCreator(true)}
          onAddClick={() => setShowCreator(true)}
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
    </>
  );
}

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

function StoryAvatar({ 
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
  const signedUrl = useSignedUrl(avatarUrl);

  const handleAddClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAddClick?.();
  };
  
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-shrink-0"
    >
      <div className="relative">
        <div className={cn(
          "h-[68px] w-[68px] rounded-full p-[3px]",
          isUploading 
            ? "bg-gradient-to-tr from-[hsl(var(--neon-pink))] via-[hsl(var(--neon-purple))] to-[hsl(var(--neon-cyan))] animate-pulse"
            : hasStory && hasUnviewed 
              ? "bg-gradient-to-tr from-[hsl(var(--neon-pink))] via-[hsl(var(--neon-purple))] to-[hsl(var(--neon-cyan))]" 
              : hasStory 
                ? "bg-muted-foreground/30" 
                : "bg-transparent"
        )}>
          <Avatar className={cn(
            "h-full w-full border-[3px] border-background",
            !hasStory && !isUploading && "border-0"
          )}>
            <AvatarImage src={signedUrl || undefined} className="object-cover" />
            <AvatarFallback className="bg-muted text-muted-foreground text-lg">
              {username?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        {showAddButton && !isUploading && (
          <div 
            onClick={handleAddClick}
            className="absolute -bottom-0.5 -right-0.5 z-10 bg-primary rounded-full p-1 border-2 border-background cursor-pointer active:scale-95 transition-transform"
          >
            <Plus className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-[68px] w-[68px] rounded-full border-2 border-transparent border-t-white animate-spin" />
          </div>
        )}
      </div>
      <span className="text-[11px] font-medium text-muted-foreground truncate w-16 text-center leading-tight">
        {isUploading ? 'Posting...' : label || displayName || username}
      </span>
    </motion.button>
  );
}
