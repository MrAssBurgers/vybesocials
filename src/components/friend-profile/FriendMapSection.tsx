import { memo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Navigation, Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLocationShareWithFriend } from '@/hooks/useLocationShareWithFriend';
import { Skeleton } from '@/components/ui/skeleton';

interface FriendMapSectionProps {
  otherProfileId: string;
  otherUsername?: string;
  canViewLocation?: boolean;
  onRequestLocation: () => void;
  className?: string;
}

export const FriendMapSection = memo(function FriendMapSection({
  otherProfileId,
  otherUsername,
  canViewLocation = true,
  onRequestLocation,
  className,
}: FriendMapSectionProps) {
  const { share, isLoading, isActive, isSharer, stopShare, pauseShare } =
    useLocationShareWithFriend(otherProfileId);

  if (isLoading) {
    return <Skeleton className={cn('h-36 w-full rounded-2xl', className)} />;
  }

  const hasCoords =
    share?.last_latitude != null && share?.last_longitude != null && isActive;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl overflow-hidden',
        className,
      )}
    >
      <div className="relative h-32 bg-gradient-to-br from-violet-950/80 via-background to-cyan-950/60 flex items-center justify-center">
        {hasCoords && canViewLocation ? (
          <div className="text-center px-4">
            <MapPin className="h-8 w-8 mx-auto mb-2 text-primary" />
            <p className="text-xs text-muted-foreground">
              {share?.last_activity_type || 'Active'} · updated{' '}
              {share?.last_updated_at
                ? new Date(share.last_updated_at).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : 'recently'}
            </p>
            {share?.last_battery_percent != null && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Battery {share.last_battery_percent}%
              </p>
            )}
          </div>
        ) : (
          <div className="text-center px-4">
            <Navigation className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {canViewLocation
                ? `No live location from @${otherUsername || 'friend'}`
                : 'Location hidden by privacy settings'}
            </p>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-wrap gap-2">
        {!isActive && canViewLocation && (
          <Button size="sm" variant="secondary" className="flex-1" onClick={onRequestLocation}>
            <MapPin className="h-3.5 w-3.5 mr-1.5" />
            Request location
          </Button>
        )}
        {isActive && isSharer && (
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => pauseShare.mutate(!share?.paused)}
            >
              {share?.paused ? (
                <Play className="h-3.5 w-3.5 mr-1" />
              ) : (
                <Pause className="h-3.5 w-3.5 mr-1" />
              )}
              {share?.paused ? 'Resume' : 'Pause'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => stopShare.mutate()}>
              <X className="h-3.5 w-3.5 mr-1" />
              Stop
            </Button>
          </>
        )}
        {isActive && !isSharer && (
          <Button size="sm" variant="ghost" onClick={() => stopShare.mutate()}>
            Stop viewing
          </Button>
        )}
      </div>
    </motion.div>
  );
});
