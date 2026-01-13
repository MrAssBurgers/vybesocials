import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface PresenceUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  is_typing: boolean;
}

interface ChatPresenceIndicatorProps {
  presentUsers: PresenceUser[];
  typingUserIds: string[];
  maxDisplay?: number;
}

// Individual avatar with typing indicator
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
      initial={{ opacity: 0, scale: 0.5, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: 10 }}
      transition={{ 
        type: 'spring', 
        stiffness: 400, 
        damping: 25,
        delay: index * 0.05 
      }}
      className="relative"
    >
      {/* Soft glow effect */}
      <div className={cn(
        "absolute inset-0 rounded-full blur-md transition-opacity duration-300",
        isTyping 
          ? "bg-primary/40 animate-pulse" 
          : "bg-primary/20"
      )} />
      
      {/* Avatar */}
      <Avatar className={cn(
        "relative h-8 w-8 ring-2 ring-background shadow-lg transition-all duration-300",
        isTyping && "ring-primary/50"
      )}>
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-xs bg-muted">
          {user.username?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Typing bubble overlay */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="absolute -top-3 -right-1 bg-muted/90 backdrop-blur-sm rounded-full px-1.5 py-0.5 shadow-lg border border-border/50"
          >
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 bg-primary rounded-full"
                  animate={{
                    y: [0, -3, 0],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.15,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

export const ChatPresenceIndicator = memo(function ChatPresenceIndicator({
  presentUsers,
  typingUserIds,
  maxDisplay = 3,
}: ChatPresenceIndicatorProps) {
  if (presentUsers.length === 0) return null;

  const displayUsers = presentUsers.slice(0, maxDisplay);
  const remainingCount = presentUsers.length - maxDisplay;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex items-center gap-1.5 px-3 py-2"
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
          className="h-8 w-8 rounded-full bg-muted/80 backdrop-blur-sm flex items-center justify-center text-xs font-semibold text-muted-foreground border border-border/50 shadow-lg"
        >
          +{remainingCount}
        </motion.div>
      )}
    </motion.div>
  );
});
