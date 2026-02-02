import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { Eye, Mic, Camera, Video, MessageCircle } from 'lucide-react';

export type ActivityType = 'viewing' | 'typing' | 'recording_voice' | 'recording_video' | 'taking_photo' | 'idle';

interface LiveActivityIndicatorProps {
  avatarUrl?: string | null;
  username?: string;
  displayName?: string | null;
  activity: ActivityType;
  isVisible: boolean;
}

// Get activity config - cleaner, professional colors
const getActivityConfig = (activity: ActivityType) => {
  switch (activity) {
    case 'viewing':
      return {
        icon: Eye,
        label: 'Viewing chat',
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500/15',
        dotColor: 'bg-emerald-500',
      };
    case 'typing':
      return {
        icon: MessageCircle,
        label: 'Typing',
        color: 'text-primary',
        bgColor: 'bg-primary/15',
        dotColor: 'bg-primary',
      };
    case 'recording_voice':
      return {
        icon: Mic,
        label: 'Recording audio',
        color: 'text-rose-500',
        bgColor: 'bg-rose-500/15',
        dotColor: 'bg-rose-500',
      };
    case 'recording_video':
      return {
        icon: Video,
        label: 'Recording video',
        color: 'text-violet-500',
        bgColor: 'bg-violet-500/15',
        dotColor: 'bg-violet-500',
      };
    case 'taking_photo':
      return {
        icon: Camera,
        label: 'Taking photo',
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/15',
        dotColor: 'bg-amber-500',
      };
    default:
      return {
        icon: Eye,
        label: 'Online',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
        dotColor: 'bg-muted-foreground',
      };
  }
};

/**
 * Live Activity Indicator - shows user's current activity in DMs
 * Professional, clean design with CSS animations (no framer-motion flickering)
 */
export const LiveActivityIndicator = memo(function LiveActivityIndicator({
  avatarUrl,
  username,
  displayName,
  activity,
  isVisible,
}: LiveActivityIndicatorProps) {
  const signedUrl = useSignedUrl(avatarUrl);
  const config = getActivityConfig(activity);
  const Icon = config.icon;
  const showDots = activity === 'typing' || activity === 'recording_voice';

  if (!isVisible || activity === 'idle') return null;

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 animate-fade-in">
      {/* Avatar with activity indicator */}
      <div className="relative">
        <Avatar className="h-8 w-8 ring-2 ring-background shadow-sm">
          <AvatarImage src={signedUrl || undefined} className="object-cover" />
          <AvatarFallback className="text-xs font-semibold bg-muted">
            {(displayName || username || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Activity dot badge - positioned bottom-right */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center",
            "ring-2 ring-background shadow-sm",
            config.bgColor
          )}
        >
          <Icon className={cn("h-2.5 w-2.5", config.color)} />
        </span>
      </div>

      {/* Activity label - clean professional style */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full",
        config.bgColor
      )}>
        <span className={cn("text-xs font-medium", config.color)}>
          {displayName || username}
        </span>
        
        {showDots ? (
          <div className="flex items-center gap-0.5">
            <span className={cn("typing-dot h-1 w-1 rounded-full", config.dotColor)} style={{ animationDelay: '0ms' }} />
            <span className={cn("typing-dot h-1 w-1 rounded-full", config.dotColor)} style={{ animationDelay: '150ms' }} />
            <span className={cn("typing-dot h-1 w-1 rounded-full", config.dotColor)} style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <span className={cn("text-xs opacity-80", config.color)}>
            {activity === 'viewing' ? '' : config.label.toLowerCase()}
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * Inline Activity Bubble - compact version for message list
 * Clean, minimal design matching modern chat apps
 */
export const InlineActivityBubble = memo(function InlineActivityBubble({
  avatarUrl,
  username,
  activity,
}: {
  avatarUrl?: string | null;
  username?: string;
  activity: ActivityType;
}) {
  const signedUrl = useSignedUrl(avatarUrl);
  const config = getActivityConfig(activity);
  const Icon = config.icon;

  if (activity === 'idle') return null;

  const showDots = activity === 'typing' || activity === 'recording_voice';

  return (
    <div className="flex items-end gap-2 mb-2 animate-fade-in">
      {/* Avatar */}
      <div className="relative">
        <Avatar className="h-7 w-7 ring-1 ring-border/50 shadow-sm">
          <AvatarImage src={signedUrl || undefined} className="object-cover" />
          <AvatarFallback className="text-[10px] font-semibold bg-muted">
            {(username || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        
        {/* Small activity dot */}
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full",
            "ring-2 ring-background",
            config.dotColor,
            // Pulse animation for active states
            (activity === 'typing' || activity === 'recording_voice') && 'animate-pulse'
          )}
        />
      </div>
      
      {/* Bubble with activity */}
      <div
        className={cn(
          "rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm",
          "bg-muted/80 backdrop-blur-sm border border-border/30"
        )}
      >
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-3.5 w-3.5", config.color)} />
          {showDots && (
            <div className="flex items-center gap-[3px]">
              <span className={cn("typing-dot h-1.5 w-1.5 rounded-full", config.dotColor)} style={{ animationDelay: '0ms' }} />
              <span className={cn("typing-dot h-1.5 w-1.5 rounded-full", config.dotColor)} style={{ animationDelay: '150ms' }} />
              <span className={cn("typing-dot h-1.5 w-1.5 rounded-full", config.dotColor)} style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
