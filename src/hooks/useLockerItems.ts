import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface LockerItem {
  id: string;
  level: number;
  reward_type: string;
  reward_name: string;
  reward_icon: string;
  reward_description: string | null;
  is_premium: boolean;
  unlocked: boolean;
}

export interface LockerData {
  titles: LockerItem[];
  effects: LockerItem[];
  cosmetics: LockerItem[];
  userLevel: number;
  equippedTitle: string | null;
  equippedEffect: string | null;
  equippedFrame: string | null;
}

export function useLockerItems(userId?: string) {
  const { profile } = useAuth();
  const targetId = userId || profile?.id;

  return useQuery({
    queryKey: ['locker-items', targetId],
    queryFn: async (): Promise<LockerData> => {
      if (!targetId) throw new Error('No user');

      // Get auth user id for user_levels lookup
      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, equipped_title, equipped_effect, equipped_frame')
        .eq('id', targetId)
        .single();

      const authId = prof?.user_id || targetId;

      // Fetch user level and all tiers in parallel
      const [levelRes, tiersRes] = await Promise.all([
        supabase.from('user_levels').select('current_level').eq('user_id', authId).maybeSingle(),
        supabase.from('battle_pass_tiers').select('*').eq('is_premium', false).order('level', { ascending: true }),
      ]);

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
        unlocked: userLevel >= t.level,
      });

      return {
        titles: tiers.filter((t: any) => t.reward_type === 'title').map(mapTier),
        effects: tiers.filter((t: any) => t.reward_type === 'effect').map(mapTier),
        cosmetics: tiers.filter((t: any) => t.reward_type === 'cosmetic').map(mapTier),
        userLevel,
        equippedTitle: (prof as any)?.equipped_title || null,
        equippedEffect: (prof as any)?.equipped_effect || null,
        equippedFrame: (prof as any)?.equipped_frame || null,
      };
    },
    enabled: !!targetId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useEquipItem() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ type, value }: { type: 'title' | 'effect' | 'frame'; value: string | null }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const col = type === 'title' ? 'equipped_title' : type === 'effect' ? 'equipped_effect' : 'equipped_frame';

      const { error } = await supabase
        .from('profiles')
        .update({ [col]: value } as any)
        .eq('id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locker-items'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile-by-username'] });
    },
  });
}
