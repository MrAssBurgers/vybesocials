import { ReactNode } from 'react';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import { StreakPopup } from './StreakPopup';

interface StreakProviderProps {
  children: ReactNode;
}

/**
 * Provider that handles login streak tracking and popups
 */
export function StreakProvider({ children }: StreakProviderProps) {
  const { 
    streak, 
    longestStreak, 
    showStreakPopup, 
    streakData,
    dismissStreakPopup 
  } = useLoginStreak();

  return (
    <>
      {children}
      <StreakPopup
        open={showStreakPopup}
        streak={streakData?.streak ?? streak}
        longestStreak={streakData?.longest_streak ?? longestStreak}
        isNewStreak={streakData?.streak === 1 && !streakData?.streak_extended}
        onClose={dismissStreakPopup}
      />
    </>
  );
}