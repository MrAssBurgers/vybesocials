import { useState, createContext, useContext, useCallback, ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtimeChallengeRewards, ChallengeReward, useRealtimeLevelUpdates, useRealtimeChallengeProgress, useVybePassTiers } from '@/hooks/useVybePass';
import { RewardClaimModal } from './RewardClaimModal';
import { LevelUpModal, LevelUpReward } from './LevelUpModal';
import { useEquipItem } from '@/hooks/useLockerItems';
import { useAuth } from '@/lib/auth';

/** Safe wrapper — never throws if AuthProvider isn't mounted yet (e.g. during
 *  a lazy-chunk race). Returning null profile just delays reward popups until
 *  auth is ready, instead of crashing the entire app tree. */
function useAuthSafe(): { profile: { onboarding_completed?: boolean } | null } {
  try {
    return useAuth() as any;
  } catch {
    return { profile: null };
  }
}
import { toast } from 'sonner';
import LocalErrorBoundary from '@/components/error/LocalErrorBoundary';

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
  const { profile } = useAuthSafe();
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
      <LocalErrorBoundary label="RewardNotificationOverlays">
        <RewardRealtimeAndModals
          pendingReward={pendingReward}
          modalOpen={modalOpen}
          dismissRewardModal={dismissRewardModal}
          showRewardModal={showRewardModal}
          showLevelUp={showLevelUp}
          levelUpOpen={levelUpOpen}
          setLevelUpOpen={setLevelUpOpen}
          levelUpData={levelUpData}
          navigate={navigate}
          equipItem={equipItem}
        />
      </LocalErrorBoundary>
    </RewardNotificationContext.Provider>
  );
}

/** Realtime subscriptions + reward modals — a crash here degrades to "rewards off". */
function RewardRealtimeAndModals({
  pendingReward,
  modalOpen,
  dismissRewardModal,
  showRewardModal,
  showLevelUp,
  levelUpOpen,
  setLevelUpOpen,
  levelUpData,
  navigate,
  equipItem,
}: {
  pendingReward: ChallengeReward | null;
  modalOpen: boolean;
  dismissRewardModal: () => void;
  showRewardModal: (reward: ChallengeReward) => void;
  showLevelUp: (data: LevelUpData) => void;
  levelUpOpen: boolean;
  setLevelUpOpen: (open: boolean) => void;
  levelUpData: LevelUpData | null;
  navigate: ReturnType<typeof useNavigate>;
  equipItem: ReturnType<typeof useEquipItem>;
}) {
  // Subscribe to realtime reward updates - shows modal when challenge completes
  useRealtimeChallengeRewards(
    (reward) => showRewardModal(reward),
    (data) => showLevelUp(data),
  );

  useRealtimeLevelUpdates();
  useRealtimeChallengeProgress();

  return (
    <>
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
            navigate('/profile?tab=locker');
            return;
          }
          try {
            await equipItem.mutateAsync({ type: reward.reward_type as any, value: reward.reward_id });
          } catch {
            // silently fail - user can equip from locker
          }
        }}
        oldLevel={levelUpData?.oldLevel || 1}
        newLevel={levelUpData?.newLevel || 1}
        rewards={levelUpData?.rewards || []}
      />
    </>
  );
}
