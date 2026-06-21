import { memo } from 'react';
import { Camera, Mic, Eye } from 'lucide-react';
import { SignedAvatar } from '@/components/ui/SignedAvatar';
import { cn } from '@/lib/utils';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';

export type PresenceActivity = ActivityType;

interface PresenceAvatarProps {
  src?: string | null;
  username?: string;
  displayName?: string | null;
  activity?: PresenceActivity;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showOnlineDot?: boolean;
  isOnline?: boolean;
}

const sizeClasses = {
  sm: 'h-8 w-8 sm:h-9 sm:w-9',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

const badgeSizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const iconSizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
};

/**
 * Snapchat-style live presence on the profile picture:
 * typing ring, reading pulse, camera badge for Snap.
 */
export const PresenceAvatar = memo(function PresenceAvatar({
  src,
  username,
  displayName,
  activity = 'idle',
  size = 'sm',
  className,
  showOnlineDot = false,
  isOnline = false,
}: PresenceAvatarProps) {
  const label = displayName || username || '?';
  const isTyping = activity === 'typing';
  const isViewing = activity === 'viewing';
  const isInSnap = activity === 'taking_photo' || activity === 'recording_video';
  const isRecordingVoice = activity === 'recording_voice';

  return (
    <div className={cn('relative flex-shrink-0', className)}>
      {/* Activity ring */}
      {(isTyping || isViewing || isInSnap || isRecordingVoice) && (
        <span
          className={cn(
            'pointer-events-none absolute inset-0 rounded-full',
            isTyping && 'ring-2 ring-primary animate-pulse',
            isViewing && 'ring-2 ring-emerald-500/80 animate-pulse',
            isInSnap && 'ring-2 ring-amber-500',
            isRecordingVoice && 'ring-2 ring-rose-500 animate-pulse',
          )}
          aria-hidden
        />
      )}

      <SignedAvatar
        src={src}
        alt={label}
        fallback={label}
        className={cn(sizeClasses[size], 'ring-1 ring-background shadow-sm')}
      />

      {/* Typing dots on avatar (Snapchat-style) */}
      {isTyping && (
        <span className="absolute -bottom-0.5 left-1/2 flex -translate-x-1/2 gap-[2px] rounded-full bg-background/90 px-1 py-0.5 shadow-sm">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="typing-dot h-1 w-1 rounded-full bg-primary"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
      )}

      {/* Viewing / in-chat eye badge (Snapchat-style) */}
      {isViewing && !isTyping && !isInSnap && !isRecordingVoice && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full',
            'bg-emerald-500 ring-2 ring-background shadow-sm',
            badgeSizeClasses[size],
          )}
          aria-label="Viewing chat"
        >
          <Eye className={cn('text-white', iconSizeClasses[size])} />
        </span>
      )}

      {/* Snap / camera badge */}
      {isInSnap && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full',
            'bg-amber-500 ring-2 ring-background shadow-sm',
            badgeSizeClasses[size],
          )}
          aria-label="In Snap"
        >
          <Camera className={cn('text-white', iconSizeClasses[size])} />
        </span>
      )}

      {/* Voice recording badge */}
      {isRecordingVoice && !isInSnap && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full',
            'bg-rose-500 ring-2 ring-background shadow-sm',
            badgeSizeClasses[size],
          )}
          aria-label="Recording voice"
        >
          <Mic className={cn('text-white', iconSizeClasses[size])} />
        </span>
      )}

      {/* Generic online dot when idle */}
      {showOnlineDot && isOnline && activity === 'idle' && !isInSnap && (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background"
          aria-hidden
        />
      )}
    </div>
  );
});
