import { memo } from 'react';
import { Smartphone, Wifi } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface FriendLinkTapAnimationProps {
  /** When true, phones pulse together and ripples run. */
  active: boolean;
  avatarUrl?: string | null;
  username?: string;
  className?: string;
}

/**
 * Lightweight phone-tap hero for Friend Link.
 * CSS keyframes only — smooth on iPhone WebViews without Framer overhead.
 */
export const FriendLinkTapAnimation = memo(function FriendLinkTapAnimation({
  active,
  avatarUrl,
  username,
  className,
}: FriendLinkTapAnimationProps) {
  const initial = username?.[0]?.toUpperCase() || '?';

  return (
    <div
      className={cn(
        'friend-link-tap-scene relative mx-auto flex w-full max-w-[320px] items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card/50 to-accent/[0.06]',
        active && 'friend-link-tap-scene--live',
        className,
      )}
      aria-hidden
    >
      <span className="friend-link-tap-ring friend-link-tap-ring--a" />
      <span className="friend-link-tap-ring friend-link-tap-ring--b" />
      <span className="friend-link-tap-flash" />

      <div className="friend-link-tap-phones relative z-10 flex items-center justify-center gap-3">
        <div className="friend-link-tap-phone friend-link-tap-phone--mine">
          <span className="friend-link-tap-notch" />
          <div className="friend-link-tap-screen">
            <Avatar className="h-full w-full rounded-[14px]">
              <AvatarImage src={avatarUrl || undefined} className="object-cover" />
              <AvatarFallback className="rounded-[14px] bg-gradient-to-br from-primary to-accent text-base font-black text-primary-foreground">
                {initial}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div className="friend-link-tap-bridge flex flex-col items-center gap-0.5">
          <Wifi className="h-4 w-4 text-primary drop-shadow-[0_0_6px_hsl(var(--primary)/0.5)]" strokeWidth={2.25} />
          <span className="friend-link-tap-dot h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.6)]" />
        </div>

        <div className="friend-link-tap-phone friend-link-tap-phone--peer">
          <span className="friend-link-tap-notch" />
          <div className="friend-link-tap-screen flex items-center justify-center bg-gradient-to-br from-accent/10 to-primary/5">
            <Smartphone className="h-7 w-7 text-accent drop-shadow-[0_0_8px_hsl(var(--accent)/0.4)]" strokeWidth={1.75} />
          </div>
        </div>
      </div>
    </div>
  );
});
