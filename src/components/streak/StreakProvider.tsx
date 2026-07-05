import { ReactNode, useState, useEffect } from 'react';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import { StreakPopup } from './StreakPopup';
import { useAuth } from '@/lib/auth';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';

interface StreakProviderProps {
  children: ReactNode;
}

/** Streak tracking + popup — isolated so a crash never takes children down. */
function StreakPopupMount() {
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
  );
}

/**
 * Handles login streak tracking and popups.
 * The streak machinery lives behind its own error boundary — if it throws,
 * the app tree it wraps keeps rendering (streaks just turn off).
 */
export function StreakProvider({ children }: StreakProviderProps) {
  return (
    <>
      {children}
      <LocalErrorBoundary label="StreakPopup">
        <StreakPopupMount />
      </LocalErrorBoundary>
    </>
  );
}