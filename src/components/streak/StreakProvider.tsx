import { ReactNode, useState, useEffect } from 'react';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import { StreakPopup } from './StreakPopup';
import { useAuth } from '@/lib/auth';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

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
    dismissStreakPopup,
    restoreStreak,
    isRestoring,
  } = useLoginStreak();
  
  const { profile } = useAuth();
  const { isPremium } = usePremiumStatus();
  const [canShowPopup, setCanShowPopup] = useState(false);

  // Delay popup display until onboarding is complete
  useEffect(() => {
    if (profile?.onboarding_completed) {
      const timer = setTimeout(() => {
        setCanShowPopup(true);
      }, 4000);
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
        isPremium={isPremium}
        onRestore={() => restoreStreak()}
        isRestoring={isRestoring}
      />
    </>
  );
}