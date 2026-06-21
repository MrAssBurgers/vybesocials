import { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { Eye, Mic, Camera, Video, MessageCircle, Upload, Phone, ImageIcon } from 'lucide-react';

export type ActivityType =
  | 'viewing'
  | 'typing'
  | 'recording_voice'
  | 'recording_video'
  | 'taking_photo'
  | 'uploading_image'
  | 'uploading_video'
  | 'sending_vybe'
  | 'in_call'
  | 'idle';

interface LiveActivityIndicatorProps {
  avatarUrl?: string | null;
  username?: string;
  displayName?: string | null;
  activity: ActivityType;
  isVisible: boolean;
}

const getActivityConfig = (activity: ActivityType) => {
  switch (activity) {
    case 'viewing':
      return { icon: Eye, label: 'In chat', color: 'text-emerald-500', bgColor: 'bg-emerald-500/15', dotColor: 'bg-emerald-500' };
    case 'typing':
      return { icon: MessageCircle, label: 'Typing', color: 'text-primary', bgColor: 'bg-primary/15', dotColor: 'bg-primary' };
    case 'recording_voice':
      return { icon: Mic, label: 'Recording', color: 'text-rose-500', bgColor: 'bg-rose-500/15', dotColor: 'bg-rose-500' };
    case 'recording_video':
      return { icon: Video, label: 'Recording video', color: 'text-violet-500', bgColor: 'bg-violet-500/15', dotColor: 'bg-violet-500' };
    case 'taking_photo':
    case 'sending_vybe':
      return { icon: Camera, label: activity === 'sending_vybe' ? 'Sending Snap' : 'In Snap', color: 'text-amber-500', bgColor: 'bg-amber-500/15', dotColor: 'bg-amber-500' };
    case 'uploading_image':
      return { icon: ImageIcon, label: 'Sending photo', color: 'text-sky-500', bgColor: 'bg-sky-500/15', dotColor: 'bg-sky-500' };
    case 'uploading_video':
      return { icon: Upload, label: 'Sending video', color: 'text-indigo-500', bgColor: 'bg-indigo-500/15', dotColor: 'bg-indigo-500' };
    case 'in_call':
      return { icon: Phone, label: 'In call', color: 'text-green-500', bgColor: 'bg-green-500/15', dotColor: 'bg-green-500' };
    default:
      return { icon: Eye, label: 'Online', color: 'text-muted-foreground', bgColor: 'bg-muted/50', dotColor: 'bg-muted-foreground' };
  }
};

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
      <div className="relative">
        <Avatar className="h-8 w-8 ring-2 ring-background shadow-sm">
          <AvatarImage src={signedUrl || undefined} className="object-cover" />
          <AvatarFallback className="text-xs font-semibold bg-muted">
            {(displayName || username || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center ring-2 ring-background shadow-sm', config.bgColor)}>
          <Icon className={cn('h-2.5 w-2.5', config.color)} />
        </span>
      </div>
      <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full', config.bgColor)}>
        <span className={cn('text-xs font-medium', config.color)}>{displayName || username}</span>
        {showDots ? (
          <div className="flex items-center gap-0.5">
            <span className={cn('typing-dot h-1 w-1 rounded-full', config.dotColor)} style={{ animationDelay: '0ms' }} />
            <span className={cn('typing-dot h-1 w-1 rounded-full', config.dotColor)} style={{ animationDelay: '150ms' }} />
            <span className={cn('typing-dot h-1 w-1 rounded-full', config.dotColor)} style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <span className={cn('text-xs opacity-80', config.color)}>{config.label.toLowerCase()}</span>
        )}
      </div>
    </div>
  );
});

/** Header avatar — peer profile picture with activity ring when in chat. */
export const ChatHeaderPresenceAvatar = memo(function ChatHeaderPresenceAvatar({
  avatarUrl,
  username,
  activity,
  fallbackAvatarUrl,
  className,
}: {
  avatarUrl?: string | null;
  username?: string;
  activity: ActivityType;
  fallbackAvatarUrl?: string | null;
  className?: string;
}) {
  const signedUrl = useSignedUrl(avatarUrl || fallbackAvatarUrl);
  const config = getActivityConfig(activity);
  const inChat = activity !== 'idle';

  return (
    <div className={cn('relative flex-shrink-0', className)}>
      <Avatar className={cn('h-8 w-8 sm:h-9 sm:w-9 ring-2 shadow-sm object-cover', inChat ? 'ring-primary/60' : 'ring-background')}>
        <AvatarImage src={signedUrl || undefined} className="object-cover" />
        <AvatarFallback className="text-sm font-semibold bg-muted">
          {(username || '?').charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      {inChat && (
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full ring-2 ring-background', config.dotColor)} />
      )}
    </div>
  );
});

/** Snapchat-style presence dock — peer pfp + activity bubble above composer. */
export const ChatPresenceDock = memo(function ChatPresenceDock({
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

  if (activity === 'idle') return null;

  const showDots = activity === 'typing' || activity === 'recording_voice';
  const Icon = config.icon;

  return (
    <div className="flex items-end gap-2 px-2.5 sm:px-3 pb-1.5 pt-1 animate-fade-in">
      <div className="relative flex-shrink-0">
        <Avatar className="h-8 w-8 ring-2 ring-primary/40 shadow-md">
          <AvatarImage src={signedUrl || undefined} className="object-cover" />
          <AvatarFallback className="text-[10px] font-semibold bg-muted">
            {(username || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className={cn('rounded-2xl rounded-bl-md px-3.5 py-2 shadow-sm bg-muted/85 backdrop-blur-md border border-border/35', config.bgColor)}>
        <div className="flex items-center gap-2 min-h-[18px]">
          {!showDots && <Icon className={cn('h-3.5 w-3.5', config.color)} aria-hidden />}
          {showDots ? (
            <div className="flex items-center gap-[4px]" aria-label={config.label}>
              <span className={cn('typing-dot-slow h-1.5 w-1.5 rounded-full', config.dotColor)} style={{ animationDelay: '0ms' }} />
              <span className={cn('typing-dot-slow h-1.5 w-1.5 rounded-full', config.dotColor)} style={{ animationDelay: '200ms' }} />
              <span className={cn('typing-dot-slow h-1.5 w-1.5 rounded-full', config.dotColor)} style={{ animationDelay: '400ms' }} />
            </div>
          ) : (
            <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
          )}
        </div>
      </div>
    </div>
  );
});

export const InlineActivityBubble = ChatPresenceDock;
