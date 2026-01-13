import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useOnlineFriends, OnlineFriend } from '@/hooks/useOnlineFriends';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface FriendAvatarProps {
  friend: OnlineFriend;
}

const FriendAvatar = memo(function FriendAvatar({ friend }: FriendAvatarProps) {
  const signedUrl = useSignedUrl(friend.avatar_url);

  return (
    <Link to={`/messages?user=${friend.id}`} className="relative group">
      <motion.div
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="relative"
      >
        <Avatar className="h-10 w-10 border-2 border-green-500 ring-2 ring-background">
          <AvatarImage src={signedUrl || undefined} />
          <AvatarFallback className="bg-secondary text-xs">
            {friend.username?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {/* Active indicator pulse */}
        <motion.div
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-green-500 rounded-full border-2 border-background"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
        />
        {/* Chat icon on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <MessageCircle className="h-4 w-4 text-white" />
        </div>
      </motion.div>
      <p className="text-[10px] text-center text-muted-foreground mt-1 truncate w-12">
        {friend.display_name || friend.username}
      </p>
    </Link>
  );
});

export const ActiveFriendsBar = memo(function ActiveFriendsBar() {
  const { onlineFriends, isLoading, onlineCount } = useOnlineFriends();

  if (isLoading || onlineFriends.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 bg-secondary/30 rounded-xl mb-4"
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-xs font-medium text-muted-foreground">
          {onlineCount} active
        </span>
      </div>
      
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1">
        <AnimatePresence mode="popLayout">
          {onlineFriends.slice(0, 6).map((friend) => (
            <motion.div
              key={friend.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <FriendAvatar friend={friend} />
            </motion.div>
          ))}
        </AnimatePresence>
        {onlineFriends.length > 6 && (
          <div className="flex items-center justify-center h-10 w-10 bg-muted rounded-full text-xs font-medium text-muted-foreground shrink-0">
            +{onlineFriends.length - 6}
          </div>
        )}
      </div>
    </motion.div>
  );
});

export default ActiveFriendsBar;
