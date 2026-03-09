import { useCallback } from 'react';
import { useBumpReactionStreak } from './useReactionStreaks';
import { useAuth } from '@/lib/auth';

/**
 * Hook to bump reaction streaks on any interaction with another user.
 * Call this when liking, commenting, messaging, etc.
 */
export function useInteractionStreakBump() {
  const { user } = useAuth();
  const bumpStreak = useBumpReactionStreak();

  const bump = useCallback((otherUserId: string) => {
    // Don't bump if same user or not authenticated
    if (!user?.id || otherUserId === user.id) return;
    
    // Fire and forget — don't block the UI
    bumpStreak.mutate(otherUserId);
  }, [user?.id, bumpStreak]);

  return bump;
}
