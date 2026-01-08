import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useStories, StoryGroup } from '@/hooks/useStories';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StoryViewer } from './StoryViewer';
import { StoryCreator } from './StoryCreator';
import { cn } from '@/lib/utils';

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
      <div className="flex gap-4 p-4 overflow-x-auto scrollbar-hide">
        {/* Add Story Button / Own Story */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => ownStoryGroup ? setSelectedGroupIndex(0) : setShowCreator(true)}
          className="flex flex-col items-center gap-2 flex-shrink-0"
        >
          <div className="relative">
            <div className={cn(
              "h-16 w-16 rounded-full p-0.5",
              ownStoryGroup?.hasUnviewed 
                ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500" 
                : ownStoryGroup 
                  ? "bg-muted" 
                  : ""
            )}>
              <Avatar className="h-full w-full border-2 border-background">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {profile?.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            {!ownStoryGroup && (
              <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-1">
                <Plus className="h-3 w-3 text-primary-foreground" />
              </div>
            )}
          </div>
          <span className="text-xs font-medium text-muted-foreground truncate w-16 text-center">
            {t('stories.yourStory')}
          </span>
        </motion.button>

        {/* Other Users' Stories */}
        {otherGroups.map((group, index) => (
          <motion.button
            key={group.user.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSelectedGroupIndex(ownStoryGroup ? index + 1 : index)}
            className="flex flex-col items-center gap-2 flex-shrink-0"
          >
            <div className={cn(
              "h-16 w-16 rounded-full p-0.5",
              group.hasUnviewed 
                ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500" 
                : "bg-muted"
            )}>
              <Avatar className="h-full w-full border-2 border-background">
                <AvatarImage src={group.user.avatar_url || undefined} />
                <AvatarFallback>
                  {group.user.username?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <span className="text-xs font-medium text-muted-foreground truncate w-16 text-center">
              {group.user.display_name || group.user.username}
            </span>
          </motion.button>
        ))}
      </div>

      {/* Story Viewer */}
      {selectedGroupIndex !== null && storyGroups && (
        <StoryViewer
          groups={storyGroups}
          initialGroupIndex={selectedGroupIndex}
          onClose={() => setSelectedGroupIndex(null)}
        />
      )}

      {/* Story Creator */}
      {showCreator && (
        <StoryCreator onClose={() => setShowCreator(false)} />
      )}
    </>
  );
}
