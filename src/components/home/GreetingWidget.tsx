import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { LiveActivityTicker } from './LiveActivityTicker';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import { useNextLevelProgress } from '@/hooks/useVybePass';

export function GreetingWidget() {
  const { profile } = useAuth();
  const signedAvatar = useFastSignedUrl(profile?.avatar_url ?? null);
  const { currentLevel } = useNextLevelProgress();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Night owl vibes';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  if (!profile) return null;

  return (
    <div className="px-3 py-4 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-3"
      >
        {/* Avatar with level badge */}
        <div className="relative flex-shrink-0">
          <Avatar className="h-11 w-11 border-2 border-primary/30 shadow-[0_0_12px_hsl(var(--primary)/0.2)]">
            <AvatarImage src={signedAvatar || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground font-bold">
              {profile.username?.[0]?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[9px] font-black rounded-full w-5 h-5 flex items-center justify-center border-2 border-background shadow-sm">
            {currentLevel}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl md:text-2xl tracking-tight truncate">
            <span className="font-medium text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">{greeting}, </span>
            <span className="font-black text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">@{profile.username}</span>
          </h1>
          {/* Gradient accent line */}
          <div className="mt-1 h-[2px] w-full rounded-full seamless-gradient-strip opacity-60" />
          <div className="mt-1">
            <LiveActivityTicker />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
