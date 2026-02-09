import { useState, createContext, useContext, useCallback, ReactNode, useEffect } from 'react';
import { useRealtimeChallengeRewards, ChallengeReward, useRealtimeLevelUpdates, useRealtimeChallengeProgress } from '@/hooks/useVybePass';
import { RewardClaimModal } from './RewardClaimModal';
import { useAuth } from '@/lib/auth';

interface RewardNotificationContextType {
  pendingReward: ChallengeReward | null;
  showRewardModal: (reward: ChallengeReward) => void;
  dismissRewardModal: () => void;
}

const RewardNotificationContext = createContext<RewardNotificationContextType | null>(null);

export function useRewardNotifications() {
  const context = useContext(RewardNotificationContext);
  if (!context) {
    throw new Error('useRewardNotifications must be used within RewardNotificationProvider');
  }
  return context;
}

interface RewardNotificationProviderProps {
  children: ReactNode;
}

export function RewardNotificationProvider({ children }: RewardNotificationProviderProps) {
  const [pendingReward, setPendingReward] = useState<ChallengeReward | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const { profile } = useAuth();

  // Check if onboarding is complete - delay popups until it is
  useEffect(() => {
    if (profile?.onboarding_completed) {
      // Add a small delay after onboarding completes to avoid bombarding user
      const timer = setTimeout(() => {
        setIsOnboardingComplete(true);
      }, 3000); // 3 second delay after onboarding
      return () => clearTimeout(timer);
    } else {
      setIsOnboardingComplete(false);
    }
  }, [profile?.onboarding_completed]);

  const showRewardModal = useCallback((reward: ChallengeReward) => {
    // Don't show rewards during onboarding
    if (!isOnboardingComplete) {
      if (import.meta.env.DEV) {
        console.log('[RewardNotification] Skipping reward modal - onboarding not complete');
      }
      return;
    }
    
    if (import.meta.env.DEV) {
      console.log('[RewardNotification] Showing reward modal:', reward);
    }
    setPendingReward(reward);
    setModalOpen(true);
  }, [isOnboardingComplete]);

  const dismissRewardModal = useCallback(() => {
    setModalOpen(false);
    // Delay clearing reward to allow animation
    setTimeout(() => setPendingReward(null), 300);
  }, []);

  // Subscribe to realtime reward updates - shows modal when challenge completes
  useRealtimeChallengeRewards((reward) => {
    showRewardModal(reward);
  });

  // Subscribe to level updates
  useRealtimeLevelUpdates();

  // Subscribe to challenge progress updates for instant UI refresh
  useRealtimeChallengeProgress();

  return (
    <RewardNotificationContext.Provider
      value={{
        pendingReward,
        showRewardModal,
        dismissRewardModal,
      }}
    >
      {children}
      <RewardClaimModal
        reward={pendingReward}
        open={modalOpen}
        onClose={dismissRewardModal}
      />
    </RewardNotificationContext.Provider>
  );
}
