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
      initial={{ opacity: 0, scale: 0, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0, y: 20 }}
      transition={{ 
        type: 'spring', 
        stiffness: 500, 
        damping: 30,
        delay: index * 0.05 
      }}
      className="relative"
    >
      {/* Pulsing ring when typing */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.15, 1], opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ 
              scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="absolute -inset-1 rounded-full bg-primary/30 blur-sm"
          />
        )}
      </AnimatePresence>
      
      {/* Avatar */}
      <Avatar className={cn(
        "relative h-9 w-9 ring-2 shadow-xl transition-all duration-200",
        isTyping 
          ? "ring-primary ring-offset-2 ring-offset-background" 
          : "ring-background/80"
      )}>
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-primary/20 to-primary/40">
          {user.username?.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Typing bubble - positioned above avatar like Snapchat */}
      <AnimatePresence>
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, scale: 0, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0, y: 5 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="absolute -top-5 left-1/2 -translate-x-1/2"
          >
            <div className="bg-muted/95 backdrop-blur-md rounded-full px-2 py-1 shadow-lg border border-border/30 flex items-center gap-[3px]">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-[5px] h-[5px] bg-primary rounded-full"
                  animate={{
                    y: [0, -4, 0],
                    opacity: [0.4, 1, 0.4],
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    delay: i * 0.12,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
            {/* Small tail pointing down */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-muted/95 rotate-45 border-r border-b border-border/30" />
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-end justify-start gap-2 px-4 py-3 pb-1"
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
          className="h-9 w-9 rounded-full bg-muted/90 backdrop-blur-md flex items-center justify-center text-xs font-bold text-muted-foreground border border-border/30 shadow-lg"
        >
          +{remainingCount}
        </motion.div>
      )}
    </motion.div>
  );
});