import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BadgeStyle } from '@/components/badges/StyledDisplayName';

export interface DisplayStyle extends BadgeStyle {
  badgeIcon?: string;
  badgeName?: string;
  equippedNameColor?: string | null;
}

/**
 * Fetches the display style (gradient, effects) for a user based on their highest-priority badge.
 * This is the single source of truth for name styling across the app.
 */
export function useDisplayStyle(userId: string | undefined) {
  return useQuery({
    queryKey: ['display-style', userId],
    queryFn: async (): Promise<DisplayStyle | null> => {
      if (!userId) return null;
      
      // Fetch badge style and equipped color in parallel
      const [badgeRes, profileRes] = await Promise.all([
        supabase.rpc('get_user_primary_badge', { p_user_id: userId }),
        supabase.from('profiles').select('equipped_name_color').eq('id', userId).maybeSingle(),
      ]);
      
      const badge = badgeRes.data?.[0];
      const equippedColor = profileRes.data?.equipped_name_color;
      
      if (!badge && !equippedColor) return null;
      
      return {
        gradient_from: badge?.gradient_from ?? null,
        gradient_to: badge?.gradient_to ?? null,
        gradient_via: badge?.gradient_via ?? null,
        effect: badge?.effect ?? null,
        is_animated: badge?.is_animated ?? false,
        badgeIcon: badge?.icon,
        badgeName: badge?.name,
        equippedNameColor: equippedColor || null,
      };
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 10, // Cache for 10 minutes
    gcTime: 1000 * 60 * 30, // Keep in memory for 30 minutes
    placeholderData: (prev) => prev,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Batch fetch display styles for multiple users at once
 */
export function useDisplayStyles(userIds: string[]) {
  return useQuery({
    queryKey: ['display-styles-batch', userIds.sort().join(',')],
    queryFn: async (): Promise<Map<string, DisplayStyle>> => {
      const result = new Map<string, DisplayStyle>();
      if (userIds.length === 0) return result;
      
      // Fetch primary badges for all users
      const promises = userIds.map(async (userId) => {
        const { data } = await supabase
          .rpc('get_user_primary_badge', { p_user_id: userId });
        
        if (data?.[0]) {
          const badge = data[0];
          result.set(userId, {
            gradient_from: badge.gradient_from,
            gradient_to: badge.gradient_to,
            gradient_via: badge.gradient_via,
            effect: badge.effect,
            is_animated: badge.is_animated,
            badgeIcon: badge.icon,
            badgeName: badge.name,
          });
        }
      });
      
      await Promise.all(promises);
      return result;
    },
    enabled: userIds.length > 0,
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
  });
}
