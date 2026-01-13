import { memo } from 'react';
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface Friend {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface FriendsWatchingIndicatorProps {
  friends: Friend[];
  className?: string;
}

const WatchingAvatar = memo(function WatchingAvatar({ 
  friend, 
  index 
}: { 
  friend: Friend; 
  index: number;
}) {
  const signedUrl = useSignedUrl(friend.avatar_url);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1, type: 'spring' }}
      style={{ marginLeft: index > 0 ? '-6px' : 0, zIndex: 10 - index }}
    >
      <Avatar className="h-5 w-5 border-2 border-background shadow-sm">
        <AvatarImage src={signedUrl || undefined} />
        <AvatarFallback className="text-[8px] bg-primary/20">
          {friend.username?.[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
    </motion.div>
  );
});

export const FriendsWatchingIndicator = memo(function FriendsWatchingIndicator({ 
  friends, 
  className 
}: FriendsWatchingIndicatorProps) {
  if (friends.length === 0) return null;

  const displayedFriends = friends.slice(0, 3);
  const remainingCount = friends.length - 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full bg-secondary/60 backdrop-blur-sm text-xs text-muted-foreground',
        className
      )}
    >
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <Eye className="h-3 w-3" />
      </motion.div>
      <div className="flex items-center">
        {displayedFriends.map((friend, index) => (
          <WatchingAvatar key={friend.id} friend={friend} index={index} />
        ))}
      </div>
      <span className="font-medium">
        {friends.length === 1 
          ? displayedFriends[0].username
          : remainingCount > 0
            ? `+${remainingCount + displayedFriends.length}`
            : `${friends.length} friends`
        }
      </span>
    </motion.div>
  );
});

export default FriendsWatchingIndicator;
