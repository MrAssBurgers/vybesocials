import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { normalizePersistedMap } from '@/lib/persistedCollections';

export interface UserStatus {
  id: string;
  user_id: string;
  emoji: string;
  text: string;
  expires_at: string | null;
  created_at: string;
}

/** Fetch a single user's active status */
export function useUserStatusById(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-status', userId],
    queryFn: async (): Promise<UserStatus | null> => {
      if (!userId) return null;
      const { data, error } = await db
        .from('user_statuses')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error || !data) return null;
      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
      return data as unknown as UserStatus;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}

/** Fetch statuses for multiple user IDs (batch) */
export function useBatchUserStatuses(userIds: string[]) {
  return useQuery({
    queryKey: ['user-statuses-batch', userIds.sort().join(',')],
    queryFn: async (): Promise<Map<string, UserStatus>> => {
      if (userIds.length === 0) return new Map();
      const { data, error } = await db
        .from('user_statuses')
        .select('*')
        .in('user_id', userIds);
      if (error || !data) return new Map();
      const now = new Date();
      const map = new Map<string, UserStatus>();
      for (const status of data) {
        if (status.expires_at && new Date(status.expires_at) < now) continue;
        map.set(status.user_id, status as unknown as UserStatus);
      }
      return map;
    },
    enabled: userIds.length > 0,
    staleTime: 60_000,
    select: (data) => normalizePersistedMap<UserStatus>(data),
  });
}

/** Set or update current user's status */
export function useSetStatus() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emoji, text, durationHours }: { emoji: string; text: string; durationHours?: number }) => {
      if (!profileId) throw new Error('Not authenticated');
      const expires_at = durationHours
        ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await db
        .from('user_statuses')
        .upsert({
          user_id: profileId,
          emoji,
          text,
          expires_at,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-status'] });
      queryClient.invalidateQueries({ queryKey: ['user-statuses-batch'] });
    },
  });
}

/** Clear current user's status */
export function useClearStatus() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error('Not authenticated');
      await db
        .from('user_statuses')
        .delete()
        .eq('user_id', profileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-status'] });
      queryClient.invalidateQueries({ queryKey: ['user-statuses-batch'] });
    },
  });
}
