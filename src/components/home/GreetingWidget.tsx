import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { LiveActivityTicker } from './LiveActivityTicker';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';
import { useNextLevelProgress } from '@/hooks/useVybePass';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { isRawId, getCachedCurrentProfile } from '@/lib/profileCache';
import { Skeleton } from '@/components/ui/skeleton';

function resolveGreetingProfile(live: ReturnType<typeof useAuth>['profile']) {
  if (live && !isRawId(live.username)) return live;
  const cached = getCachedCurrentProfile();
  if (!cached || isRawId(cached.username)) return live;
  return {
    id: cached.id,
    user_id: cached.user_id || live?.user_id || '',
    username: cached.username,
    display_name: cached.display_name,
    avatar_url: cached.avatar_url,
    bio: cached.bio || '',
    created_at: live?.created_at || new Date().toISOString(),
    onboarding_completed: cached.onboarding_completed === true ? true : undefined,
  } as NonNullable<typeof live>;
}

export function GreetingWidget() {
  const { profile: liveProfile } = useAuth();
  const profile = resolveGreetingProfile(liveProfile);
  const { currentLevel, isReady: levelReady } = useNextLevelProgress();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Night owl mode';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  if (!profile) {
    return (
      <div className="home-hero relative mx-3 mb-1 overflow-hidden rounded-3xl px-4 py-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (isRawId(profile.username)) {
    return (
      <div className="home-hero relative mx-3 mb-1 overflow-hidden rounded-3xl px-4 py-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full shrink-0 animate-pulse" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-36 animate-pulse" />
            <p className="text-xs text-muted-foreground">Loading your profile…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-hero relative mx-3 mb-1 overflow-hidden rounded-3xl">
      <div className="home-hero-aurora pointer-events-none" aria-hidden />
      <div className="home-hero-grid pointer-events-none" aria-hidden />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="relative z-10 px-4 py-5 sm:px-5 sm:py-6"
      >
        <div className="flex items-start gap-4">
          <div className="relative flex-shrink-0">
            <div className="home-hero-avatar-ring absolute -inset-1 rounded-full opacity-80" />
            <Avatar className="relative h-14 w-14 sm:h-16 sm:w-16 ring-2 ring-background/80 shadow-lg">
              <ProfileAvatarImage
                profileId={profile.id}
                src={profile.avatar_url || undefined}
                transformSize={160}
              />
              <AvatarFallback className="bg-gradient-to-br from-primary/30 to-accent/30 font-bold text-lg">
                {profile.username?.[0]?.toUpperCase() ?? '?'}
              </AvatarFallback>
            </Avatar>
            {levelReady && currentLevel != null && (
              <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-gradient-to-br from-primary to-accent text-[10px] font-black text-primary-foreground shadow-md">
                {currentLevel}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-1.5 mb-1">
              <VybeMiniIcon size={14} showSparkles className="text-primary shrink-0" />
              <span className="home-hero-eyebrow">Your feed</span>
            </div>
            <h1 className="home-hero-title leading-tight">{greeting}</h1>
            <p className="home-hero-handle truncate mt-0.5">@{profile.username}</p>
            <div className="mt-2.5">
              <LiveActivityTicker />
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 pt-1">
            <Sparkles className="h-4 w-4 text-primary/60" />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
              Live
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
