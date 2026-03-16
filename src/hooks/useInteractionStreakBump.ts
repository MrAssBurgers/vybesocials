import { useCallback } from 'react';
import { useBumpReactionStreak } from './useReactionStreaks';
import { useAuth } from '@/lib/auth';

/**
 * Hook to bump reaction streaks on any interaction with another user.
 * Call this when liking, commenting, messaging, etc.
 */
export function useInteractionStreakBump() {
  const { profile } = useAuth();
  const bumpStreak = useBumpReactionStreak();

  const bump = useCallback((otherUserId: string) => {
    if (!profile?.id || otherUserId === profile.id) return;

    bumpStreak.mutate(otherUserId);
  }, [profile?.id, bumpStreak]);

  return bump;
}
