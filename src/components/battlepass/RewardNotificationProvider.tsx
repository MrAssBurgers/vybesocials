import { useState, createContext, useContext, useCallback, ReactNode } from 'react';
import { useRealtimeChallengeRewards, ChallengeReward, useRealtimeLevelUpdates } from '@/hooks/useBattlePass';
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
    setPendingReward(reward);
    setModalOpen(true);
  }, []);

  const dismissRewardModal = useCallback(() => {
    setModalOpen(false);
    // Delay clearing reward to allow animation
    setTimeout(() => setPendingReward(null), 300);
  }, []);

  // Subscribe to realtime reward updates
  useRealtimeChallengeRewards((reward) => {
    showRewardModal(reward);
  });

  // Subscribe to level updates
  useRealtimeLevelUpdates();

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
