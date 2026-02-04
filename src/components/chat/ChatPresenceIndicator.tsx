import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

/**
 * Individual presence avatar - clean, professional design
 * Uses CSS animations for smooth, flicker-free typing indicators
 * Shows badge-styled username in tooltip
 */
const PresenceAvatar = memo(function PresenceAvatar({
  user,
  isTyping,
}: {
  user: PresenceUser;
  isTyping: boolean;
}) {
  const signedUrl = useSignedUrl(user.avatar_url);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative animate-scale-in cursor-pointer">
          {/* Avatar with subtle ring - increased size to match message bubbles */}
          <Avatar className={cn(
            "h-8 w-8 ring-2 shadow-sm transition-all duration-200",
            isTyping 
              ? "ring-primary" 
              : "ring-background"
          )}>
            <AvatarImage src={signedUrl || undefined} className="object-cover" />
            <AvatarFallback className="text-[11px] font-semibold bg-muted">
              {user.username?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          {/* Typing bubble - positioned above avatar */}
          {isTyping && (
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 animate-fade-in">
              <div className="bg-muted/90 backdrop-blur-sm rounded-full px-2 py-1 shadow-sm border border-border/30 flex items-center gap-[3px]">
                <span className="typing-dot h-1 w-1 bg-primary rounded-full" style={{ animationDelay: '0ms' }} />
                <span className="typing-dot h-1 w-1 bg-primary rounded-full" style={{ animationDelay: '150ms' }} />
                <span className="typing-dot h-1 w-1 bg-primary rounded-full" style={{ animationDelay: '300ms' }} />
              </div>
              {/* Tail pointing down */}
              <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-muted/90 rotate-45 border-r border-b border-border/30" />
            </div>
          )}

          {/* Online dot when not typing */}
          {!isTyping && (
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="px-2 py-1">
        <StyledUsername
          userId={user.user_id}
          username={user.username}
          displayName={user.display_name}
          className="text-sm"
        />
      </TooltipContent>
    </Tooltip>
  );
});

/**
 * Chat Presence Indicator for group chats
 * Shows who's currently viewing with clean, professional styling
 */
export const ChatPresenceIndicator = memo(function ChatPresenceIndicator({
  presentUsers,
  typingUserIds,
  maxDisplay = 3,
}: ChatPresenceIndicatorProps) {
  if (presentUsers.length === 0) return null;

  const displayUsers = presentUsers.slice(0, maxDisplay);
  const remainingCount = presentUsers.length - maxDisplay;

  return (
    <div className="animate-fade-in pointer-events-none select-none">
      <div className="flex items-end justify-start gap-2.5 py-2 pt-3">
        {displayUsers.map((user) => (
          <PresenceAvatar
            key={user.user_id}
            user={user}
            isTyping={typingUserIds.includes(user.user_id)}
          />
        ))}

        {/* Overflow count */}
        {remainingCount > 0 && (
          <div className="h-8 w-8 rounded-full bg-muted/80 backdrop-blur-sm flex items-center justify-center text-[11px] font-semibold text-muted-foreground ring-2 ring-background shadow-sm animate-scale-in">
            +{remainingCount}
          </div>
        )}
      </div>
    </div>
  );
});
