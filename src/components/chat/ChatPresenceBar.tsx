import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { TypingBubble } from './TypingBubble';

interface PresenceUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  is_typing: boolean;
}

interface ChatPresenceBarProps {
  presentUsers: PresenceUser[];
  typingUserIds: string[];
  maxDisplay?: number;
}

// Individual presence avatar with typing indicator overlay
const PresenceAvatar = memo(function PresenceAvatar({
  user,
  isTyping,
  index,
}: {
  user: PresenceUser;
  isTyping: boolean;
  index: number;
}) {
  const signedUrl = useSignedUrl(user.avatar_url);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: 12 }}
      transition={{ 
        type: 'spring', 
        stiffness: 400, 
        damping: 25,
        delay: index * 0.04 
      }}
      className="relative"
    >
      {/* Glow effect when typing */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 rounded-full bg-primary/30 blur-md animate-pulse"
          />
        )}
      </AnimatePresence>
      
      {/* Avatar */}
      <Avatar className={cn(
        "relative h-7 w-7 ring-2 ring-background shadow-md transition-all duration-200",
        isTyping && "ring-primary/50"
      )}>
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-[10px] bg-muted">
          {user.username?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Typing bubble overlay - appears above the avatar */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, scale: 0, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="absolute -top-4 left-1/2 -translate-x-1/2"
          >
            <TypingBubble size="sm" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

/**
 * Snapchat-style presence bar - floats above the input area
 * Shows who's viewing the chat with typing indicators
 */
export const ChatPresenceBar = memo(function ChatPresenceBar({
  presentUsers,
  typingUserIds,
  maxDisplay = 3,
}: ChatPresenceBarProps) {
  if (presentUsers.length === 0) return null;

  const displayUsers = presentUsers.slice(0, maxDisplay);
  const remainingCount = presentUsers.length - maxDisplay;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      className="flex items-end justify-center gap-1.5 px-3 pb-1.5 pt-2"
    >
      <AnimatePresence mode="popLayout">
        {displayUsers.map((user, index) => (
          <PresenceAvatar
            key={user.user_id}
            user={user}
            isTyping={typingUserIds.includes(user.user_id)}
            index={index}
          />
        ))}
      </AnimatePresence>

      {/* +X indicator for overflow */}
      {remainingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: displayUsers.length * 0.04 }}
          className="h-7 w-7 rounded-full bg-muted/90 backdrop-blur-sm flex items-center justify-center text-[10px] font-semibold text-muted-foreground ring-2 ring-background shadow-md"
        >
          +{remainingCount}
        </motion.div>
      )}
    </motion.div>
  );
});

export default ChatPresenceBar;
