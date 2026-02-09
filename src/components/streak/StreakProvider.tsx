import { ReactNode, useState, useEffect } from 'react';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import { StreakPopup } from './StreakPopup';
import { useAuth } from '@/lib/auth';

interface StreakProviderProps {
  children: ReactNode;
}

/**
 * Provider that handles login streak tracking and popups
 * Delays popup display until onboarding is complete
 */
export function StreakProvider({ children }: StreakProviderProps) {
  const { 
    streak, 
    longestStreak, 
    showStreakPopup, 
    streakData,
    dismissStreakPopup 
  } = useLoginStreak();
  
  const { profile } = useAuth();
  const [canShowPopup, setCanShowPopup] = useState(false);

  // Delay popup display until onboarding is complete
  useEffect(() => {
    if (profile?.onboarding_completed) {
      // Add delay after onboarding to avoid bombarding user
      const timer = setTimeout(() => {
        setCanShowPopup(true);
      }, 4000); // 4 second delay after onboarding
      return () => clearTimeout(timer);
    } else {
      setCanShowPopup(false);
    }
  }, [profile?.onboarding_completed]);

  return (
    <>
      {children}
      <StreakPopup
        open={showStreakPopup && canShowPopup}
        streak={streakData?.streak ?? streak}
        longestStreak={streakData?.longest_streak ?? longestStreak}
        isNewStreak={streakData?.streak === 1 && !streakData?.streak_extended}
        onClose={dismissStreakPopup}
      />
    </>
  );
}