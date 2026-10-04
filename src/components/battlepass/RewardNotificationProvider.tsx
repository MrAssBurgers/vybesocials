import { useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { useRealtimeChallengeRewards, ChallengeReward, useRealtimeLevelUpdates, useRealtimeChallengeProgress } from '@/hooks/useBattlePass';
import { RewardClaimModal } from './RewardClaimModal';

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

  const showRewardModal = useCallback((reward: ChallengeReward) => {
    if (import.meta.env.DEV) {
      console.log('[RewardNotification] Showing reward modal:', reward);
    }
    setPendingReward(reward);
    setModalOpen(true);
  }, []);

  const dismissRewardModal = useCallback(() => {
    setModalOpen(false);
    // Delay clearing reward to allow animation
    setTimeout(() => setPendingReward(null), 300);
  }, []);

  // Subscribe to realtime reward updates - shows modal when challenge completes
  useRealtimeChallengeRewards(() => {
    // Claimed automatically. One toast, no extra claim dialog.
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
