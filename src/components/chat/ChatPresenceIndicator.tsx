import { memo } from 'react';
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
// Uses CSS animations instead of framer-motion to prevent flickering
const PresenceAvatar = memo(function PresenceAvatar({
  user,
  isTyping,
}: {
  user: PresenceUser;
  isTyping: boolean;
}) {
  const signedUrl = useSignedUrl(user.avatar_url);

  return (
    <div className="relative animate-scale-in">
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

      {/* Typing bubble - positioned above avatar, uses CSS animation */}
      {isTyping && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 animate-fade-in">
          <div className="bg-muted/90 backdrop-blur-sm rounded-full px-1.5 py-0.5 shadow-lg border border-border/40 flex items-center gap-[2px]">
            {/* CSS-animated dots - much more performant than framer-motion infinite */}
            <span className="typing-dot w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary rounded-full" style={{ animationDelay: '0ms' }} />
            <span className="typing-dot w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary rounded-full" style={{ animationDelay: '150ms' }} />
            <span className="typing-dot w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary rounded-full" style={{ animationDelay: '300ms' }} />
          </div>
          {/* Small tail pointing down */}
          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-muted/90 rotate-45 border-r border-b border-border/40" />
        </div>
      )}
    </div>
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
    <div className="animate-fade-in pointer-events-none select-none">
      <div className="flex items-end justify-start gap-1.5 sm:gap-2 py-2 pt-3">
        {displayUsers.map((user) => (
          <PresenceAvatar
            key={user.user_id}
            user={user}
            isTyping={typingUserIds.includes(user.user_id)}
          />
        ))}

        {/* +X indicator for overflow */}
        {remainingCount > 0 && (
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-muted/80 backdrop-blur-sm flex items-center justify-center text-[10px] sm:text-xs font-bold text-muted-foreground border border-border/40 shadow-md animate-scale-in">
            +{remainingCount}
          </div>
        )}
      </div>
    </div>
  );
});
