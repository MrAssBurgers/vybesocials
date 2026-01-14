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

// Individual avatar with typing indicator - Snapchat style
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
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ 
        type: 'spring', 
        stiffness: 400, 
        damping: 25,
        delay: index * 0.03 
      }}
      className="relative"
    >
      {/* Avatar */}
      <Avatar className={cn(
        "h-7 w-7 sm:h-8 sm:w-8 ring-2 shadow-md transition-all duration-200",
        isTyping 
          ? "ring-primary ring-offset-1 ring-offset-background" 
          : "ring-background/60"
      )}>
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-[10px] sm:text-xs font-semibold bg-gradient-to-br from-muted to-muted/80">
          {user.username?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Typing bubble - positioned above avatar */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="absolute -top-6 left-1/2 -translate-x-1/2"
          >
            <div className="bg-muted/90 backdrop-blur-sm rounded-full px-1.5 py-0.5 shadow-lg border border-border/40 flex items-center gap-[2px]">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary rounded-full"
                  animate={{
                    y: [0, -3, 0],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.1,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
            {/* Small tail pointing down */}
            <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-muted/90 rotate-45 border-r border-b border-border/40" />
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
  // Don't render anything if no users
  if (presentUsers.length === 0) return null;

  const displayUsers = presentUsers.slice(0, maxDisplay);
  const remainingCount = presentUsers.length - maxDisplay;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="pointer-events-none select-none"
    >
      <div className="flex items-end justify-start gap-1.5 sm:gap-2 py-2 pt-3">
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
            className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-muted/80 backdrop-blur-sm flex items-center justify-center text-[10px] sm:text-xs font-bold text-muted-foreground border border-border/40 shadow-md"
          >
            +{remainingCount}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
});
