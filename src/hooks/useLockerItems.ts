import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useTokenAction, useTokenMarketplaceState } from './useTokenMarketplaceState';
import { tokenMarketplaceRequest, type EquipType } from '@/lib/tokenMarketplaceService';
import { usePremiumStatus } from './usePremiumStatus';
import { toast } from 'sonner';
import { MARKETPLACE_EQUIP_MAP } from '@/lib/marketplaceEquip';

export interface LockerItem {
  id: string;
  level: number;
  reward_type: string;
  reward_name: string;
  reward_icon: string;
  reward_description: string | null;
  is_premium: boolean;
  unlocked: boolean; equip_value?: string;
}

export interface LockerData {
  titles: LockerItem[];
  effects: LockerItem[];
  cosmetics: LockerItem[];
  name_colors: LockerItem[];
  profile_themes: LockerItem[];
  userLevel: number;
  equippedTitle: string | null;
  equippedEffect: string | null;
  equippedFrame: string | null;
  equippedNameColor: string | null;
  equippedProfileTheme: string | null;
  equippedBadgeId: string | null;
}

export function useLockerItems(userId?: string) {
  const { user, profile } = useAuth();
  const targetId = userId || profile?.id;
  const own = targetId === profile?.id || targetId === user?.id;
  const state = useTokenMarketplaceState(own);
  const { hasPremiumCosmetics } = usePremiumStatus();

  const query = useQuery({
    queryKey: ['locker-items', user?.id, targetId, state.data?.verified_total_xp, state.data?.inventory, hasPremiumCosmetics],
    queryFn: async (): Promise<LockerData> => {
      if (!targetId) throw new Error('No user');

      const { data: prof, error: profileError } = await db
        .from('profiles')
        .select('user_id, equipped_title, equipped_effect, equipped_frame, equipped_name_color, equipped_profile_theme, equipped_badge_id')
        .eq('id', targetId)
        .single();

      if (profileError) throw profileError;
      const authId = prof?.user_id || targetId;

      const [levelRes, tiersRes] = await Promise.all([
        db.from('user_levels').select('current_level').eq('user_id', authId).maybeSingle(),
        db.from('battle_pass_tiers').select('*').order('level', { ascending: true }),
      ]);

      if (levelRes.error) throw levelRes.error;
      if (tiersRes.error) throw tiersRes.error;
      const userLevel = levelRes.data?.current_level || 1;
      const tiers = tiersRes.data || [];

      const mapTier = (t: any): LockerItem => ({
        id: t.id,
        level: t.level,
        reward_type: t.reward_type,
        reward_name: t.reward_name,
        reward_icon: t.reward_icon,
        reward_description: t.reward_description,
        is_premium: t.is_premium,
        unlocked: own && (t.is_premium ? hasPremiumCosmetics : t.level <= 1 || (state.data?.verified_total_xp !== undefined && typeof t.xp_required === 'number' && state.data.verified_total_xp >= t.xp_required)),
      });

      const purchased = (own ? state.data?.catalog || [] : []).filter(item => item.kind === 'permanent' && state.data?.inventory.some(owned => owned.item_id === item.id && owned.quantity > 0)).map(item => ({
        id: item.id, level: 1, reward_type: MARKETPLACE_EQUIP_MAP[item.id]?.type === 'frame' ? 'cosmetic' : 'profile_theme', reward_name: item.name, reward_icon: item.icon,
        reward_description: item.description, is_premium: false, unlocked: own, equip_value: MARKETPLACE_EQUIP_MAP[item.id]?.value,
      }));
      return {
        titles: tiers.filter((t: any) => t.reward_type === 'title').map(mapTier),
        effects: tiers.filter((t: any) => t.reward_type === 'effect').map(mapTier),
        cosmetics: [...tiers.filter((t: any) => t.reward_type === 'cosmetic').map(mapTier), ...purchased.filter(item => item.reward_type === 'cosmetic')],
        name_colors: tiers.filter((t: any) => t.reward_type === 'name_color').map(mapTier),
        profile_themes: [...tiers.filter((t: any) => t.reward_type === 'profile_theme').map(mapTier), ...purchased.filter(item => item.reward_type === 'profile_theme')],
        userLevel,
        equippedTitle: (prof as any)?.equipped_title || null,
        equippedEffect: (prof as any)?.equipped_effect || null,
        equippedFrame: (prof as any)?.equipped_frame || null,
        equippedNameColor: (prof as any)?.equipped_name_color || null,
        equippedProfileTheme: (prof as any)?.equipped_profile_theme || null,
        equippedBadgeId: (prof as any)?.equipped_badge_id || null,
      };
    },
    enabled: !!targetId && !!user?.id,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });
  return { ...query, equipmentReady: !own || (state.isSuccess && !state.isError), equipmentError: own && state.isError, retryEquipment: state.refetch, legacyReview: own && !!state.data?.legacy_review };
}

export function useEquipItem() {
  return useTokenAction(({ type, value }: { type: EquipType; value: string | null }, guard) =>
    tokenMarketplaceRequest({ action: 'equip', type, value }, guard), undefined, error => toast.error(error.message));
}
