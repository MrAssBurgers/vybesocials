import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, getFirebaseAuth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: 'role' | 'patreon' | 'referral' | 'challenge' | 'achievement' | 'beta' | 'special';
  priority: number;
  gradient_from: string | null;
  gradient_to: string | null;
  gradient_via: string | null;
  effect: string | null;
  is_animated: boolean;
  unlock_requirement: string | null;
  unlock_threshold: number | null;
  is_staff_badge: boolean;
  can_be_disabled: boolean;
}

export interface UserBadge {
  id: string;
  user_id: string;
  badge_id: string;
  is_pinned: boolean;
  pin_order: number | null;
  is_primary: boolean;
  show_effect: boolean;
  earned_at: string;
  expires_at: string | null;
  badge: Badge;
}

/**
 * Fetch all available badges
 */
export function useAllBadges() {
  return useQuery({
    queryKey: ['all-badges'],
    queryFn: async () => {
      const { data, error } = await db
        .from('badges')
        .select('*')
        .order('priority', { ascending: true });
      
      if (error) throw error;
      return data as Badge[];
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

/**
 * Fetch a user's earned badges
 */
export function useUserBadges(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-badges', userId],
    queryFn: async () => {
      if (!userId) return [];
      
      // Use the new RPC function that resolves profile ID → auth user_id
      const { data, error } = await db
        .rpc('get_user_badges_by_profile', { p_profile_id: userId });
      
      if (error) throw error;
      
      // Map the flat response to the expected shape
      return (data || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        badge_id: row.badge_id,
        is_pinned: row.is_pinned,
        pin_order: row.pin_order,
        is_primary: row.is_primary,
        show_effect: row.show_effect,
        earned_at: row.earned_at,
        expires_at: row.expires_at,
        badge: {
          id: row.badge_id,
          name: row.badge_name,
          description: row.badge_description,
          icon: row.badge_icon,
          category: row.badge_category,
          priority: row.badge_priority,
          gradient_from: row.badge_gradient_from,
          gradient_to: row.badge_gradient_to,
          gradient_via: row.badge_gradient_via,
          effect: row.badge_effect,
          is_animated: row.badge_is_animated,
        } as Badge,
      })) as UserBadge[];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get user's primary (highest priority) badge
 */
export function useUserPrimaryBadge(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-primary-badge', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      const { data, error } = await db
        .rpc('get_user_primary_badge', { p_user_id: userId });
      
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Update user's badge display settings
 */
export function useUpdateBadgeSettings() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      badgeId,
      updates,
    }: {
      badgeId: string;
      updates: { is_pinned?: boolean; pin_order?: number; show_effect?: boolean };
    }) => {
      if (!profile || !user || getFirebaseAuth()?.currentUser?.uid !== user.id) throw new Error('Not authenticated');
      
      const { error } = await db
        .from('user_badges')
        .update(updates)
        .in('user_id', [...new Set([profile.id, user.id])])
        .eq('badge_id', badgeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-badges', profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-primary-badge', profile?.id] });
    },
  });
}

/**
 * Award a badge to a user (admin only)
 */
export function useAwardBadge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userId,
      badgeId,
      expiresAt,
    }: {
      userId: string;
      badgeId: string;
      expiresAt?: string;
    }) => {
      if (!user || getFirebaseAuth()?.currentUser?.uid !== user.id) throw new Error('Sign in again before changing badges');
      const { data, error } = await db
        .rpc('award_badge', {
          p_user_id: userId,
          p_badge_id: badgeId,
          p_expires_at: expiresAt || null,
        });
      
      if (getFirebaseAuth()?.currentUser?.uid !== user.id) throw new Error('Account changed');
      if (error) throw error;
      if (!data || data.success !== true) throw new Error('Badge award was not confirmed');
      return { ...data, actorUid: user.id };
    },
    onSuccess: (data, variables) => {
      if (getFirebaseAuth()?.currentUser?.uid !== data.actorUid) return;
      queryClient.invalidateQueries({ queryKey: ['user-badges', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['user-primary-badge', variables.userId] });
    },
  });
}

/**
 * Remove a badge from a user (admin only)
 */
export function useRemoveBadge() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      userId,
      badgeId,
    }: {
      userId: string;
      badgeId: string;
    }) => {
      if (!user || getFirebaseAuth()?.currentUser?.uid !== user.id) throw new Error('Sign in again before changing badges');
      const { data, error } = await db.rpc('revoke_badge', { p_user_id: userId, p_badge_id: badgeId });
      
      if (getFirebaseAuth()?.currentUser?.uid !== user.id) throw new Error('Account changed');
      if (error) throw error;
      if (!data || data.success !== true) throw new Error('Badge removal was not confirmed');
      return { actorUid: user.id };
    },
    onSuccess: (data, variables) => {
      if (getFirebaseAuth()?.currentUser?.uid !== data.actorUid) return;
      queryClient.invalidateQueries({ queryKey: ['user-badges', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['user-primary-badge', variables.userId] });
    },
  });
}
