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
  name_colors: LockerItem[];
  profile_themes: LockerItem[];
  userLevel: number;
  equippedTitle: string | null;
  equippedEffect: string | null;
  equippedFrame: string | null;
  equippedNameColor: string | null;
  equippedProfileTheme: string | null;
}

export function useLockerItems(userId?: string) {
  const { profile } = useAuth();
  const targetId = userId || profile?.id;

  return useQuery({
    queryKey: ['locker-items', targetId],
    queryFn: async (): Promise<LockerData> => {
      if (!targetId) throw new Error('No user');

      const { data: prof } = await supabase
        .from('profiles')
        .select('user_id, equipped_title, equipped_effect, equipped_frame, equipped_name_color, equipped_profile_theme')
        .eq('id', targetId)
        .single();

      const authId = prof?.user_id || targetId;

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
        name_colors: tiers.filter((t: any) => t.reward_type === 'name_color').map(mapTier),
        profile_themes: tiers.filter((t: any) => t.reward_type === 'profile_theme').map(mapTier),
        userLevel,
        equippedTitle: (prof as any)?.equipped_title || null,
        equippedEffect: (prof as any)?.equipped_effect || null,
        equippedFrame: (prof as any)?.equipped_frame || null,
        equippedNameColor: (prof as any)?.equipped_name_color || null,
        equippedProfileTheme: (prof as any)?.equipped_profile_theme || null,
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
    mutationFn: async ({ type, value }: { type: 'title' | 'effect' | 'frame' | 'name_color' | 'profile_theme'; value: string | null }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const colMap: Record<string, string> = {
        title: 'equipped_title',
        effect: 'equipped_effect',
        frame: 'equipped_frame',
        name_color: 'equipped_name_color',
        profile_theme: 'equipped_profile_theme',
      };

      const { error } = await supabase
        .from('profiles')
        .update({ [colMap[type]]: value } as any)
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
