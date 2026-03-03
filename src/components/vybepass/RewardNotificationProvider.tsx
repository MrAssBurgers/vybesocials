import { useState, createContext, useContext, useCallback, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeChallengeRewards, ChallengeReward, useRealtimeLevelUpdates, useRealtimeChallengeProgress, useVybePassTiers } from '@/hooks/useVybePass';
import { RewardClaimModal } from './RewardClaimModal';
import { LevelUpModal, LevelUpReward } from './LevelUpModal';
import { useEquipItem } from '@/hooks/useLockerItems';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface LevelUpData {
  oldLevel: number;
  newLevel: number;
  rewards: LevelUpReward[];
}

interface RewardNotificationContextType {
  pendingReward: ChallengeReward | null;
  showRewardModal: (reward: ChallengeReward) => void;
  dismissRewardModal: () => void;
  showLevelUp: (data: LevelUpData) => void;
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
  const [levelUpData, setLevelUpData] = useState<LevelUpData | null>(null);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const { profile } = useAuth();
  const { data: tiers } = useVybePassTiers();
  const navigate = useNavigate();
  const equipItem = useEquipItem();

  // Check if onboarding is complete - delay popups until it is
  useEffect(() => {
    if (profile?.onboarding_completed) {
      const timer = setTimeout(() => {
        setIsOnboardingComplete(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setIsOnboardingComplete(false);
    }
  }, [profile?.onboarding_completed]);

  const showRewardModal = useCallback((reward: ChallengeReward) => {
    if (!isOnboardingComplete) return;
    setPendingReward(reward);
    setModalOpen(true);
  }, [isOnboardingComplete]);

  const dismissRewardModal = useCallback(() => {
    setModalOpen(false);
    setTimeout(() => setPendingReward(null), 300);
  }, []);

  const showLevelUp = useCallback((data: LevelUpData) => {
    if (!isOnboardingComplete) return;
    
    // If we have tiers data, compute rewards from tiers for the levels gained
    let rewards = (data.rewards || []).filter((r: any) => !r.is_premium);
    if (rewards.length === 0 && tiers) {
      rewards = tiers
        .filter(t => t.level > data.oldLevel && t.level <= data.newLevel && !t.is_premium)
        .map(t => ({
          level: t.level,
          reward_type: t.reward_type,
          reward_id: t.reward_id,
          reward_name: t.reward_name,
          reward_icon: t.reward_icon,
        }));
    }
    
    setLevelUpData({ ...data, rewards });
    setLevelUpOpen(true);
  }, [isOnboardingComplete, tiers]);

  // Subscribe to realtime reward updates - shows modal when challenge completes
  useRealtimeChallengeRewards(
    (reward) => showRewardModal(reward),
    (data) => showLevelUp(data),
  );

  useRealtimeLevelUpdates();
  useRealtimeChallengeProgress();

  return (
    <RewardNotificationContext.Provider
      value={{
        pendingReward,
        showRewardModal,
        dismissRewardModal,
        showLevelUp,
      }}
    >
      {children}
      <RewardClaimModal
        reward={pendingReward}
        open={modalOpen}
        onClose={dismissRewardModal}
      />
      <LevelUpModal
        open={levelUpOpen}
        onClose={() => setLevelUpOpen(false)}
        onGoToLocker={() => navigate('/profile?tab=locker')}
        onEquipReward={async (reward) => {
          if (!reward.reward_id) {
            toast.info('Head to your Locker to equip this!');
            navigate('/profile?tab=locker');
            return;
          }
          try {
            await equipItem.mutateAsync({ type: reward.reward_type as any, value: reward.reward_id });
            toast.success(`Equipped ${reward.reward_name}!`);
          } catch {
            toast.error('Could not equip — try from your Locker');
          }
        }}
        oldLevel={levelUpData?.oldLevel || 1}
        newLevel={levelUpData?.newLevel || 1}
        rewards={levelUpData?.rewards || []}
      />
    </RewardNotificationContext.Provider>
  );
}
