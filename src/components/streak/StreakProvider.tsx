import { ReactNode, useState, useEffect } from 'react';
import { useLoginStreak } from '@/hooks/useLoginStreak';
import { StreakPopup } from './StreakPopup';
import { useAuth } from '@/lib/auth';
import { useProfileAccount } from '@/hooks/useProfileAccount';
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
    popupError, retryStreak, isUpdating,
  } = useLoginStreak();

  const { profile } = useAuth();
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
      onClose={dismissStreakPopup}
      receipt={streakData}
      error={popupError}
      onRetry={retryStreak}
      isUpdating={isUpdating}
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
  const account = useProfileAccount();
  return (
    <>
      {children}
      <LocalErrorBoundary label="StreakPopup">
        {account.ready && <StreakPopupMount key={`${account.user!.id}:${account.profile!.id}:${account.session.epoch}`} />}
      </LocalErrorBoundary>
    </>
  );
}
