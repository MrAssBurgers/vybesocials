import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { normalizePersistedSet } from '@/lib/persistedCollections';

// =============================================
// FOUNDING MEMBER COUNTDOWN
// =============================================

interface FoundingStatus {
  maxSlots: number;
  claimedSlots: number;
  remainingSlots: number;
  isActive: boolean;
  userIsFounder: boolean;
}

export function useFoundingStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['founding-status', user?.id],
    queryFn: async (): Promise<FoundingStatus> => {
      // Get config
      const { data: config } = await supabase
        .from('growth_config')
        .select('value')
        .eq('key', 'founding_program')
        .maybeSingle();

      const val = config?.value as Record<string, any> | null;
      const maxSlots = val?.max_slots ?? 500;
      const badgeId = val?.badge_id;
      const isActive = val?.is_active ?? false;

      // Count claimed
      let claimedSlots = 0;
      if (badgeId) {
        const { count } = await supabase
          .from('user_badges')
          .select('*', { count: 'exact', head: true })
          .eq('badge_id', badgeId);
        claimedSlots = count || 0;
      }

      // Check if current user is founder
      let userIsFounder = false;
      if (user?.id && badgeId) {
        const { data } = await supabase
          .from('user_badges')
          .select('id')
          .eq('user_id', user.id)
          .eq('badge_id', badgeId)
          .maybeSingle();
        userIsFounder = !!data;
      }

      return {
        maxSlots,
        claimedSlots,
        remainingSlots: Math.max(0, maxSlots - claimedSlots),
        isActive,
        userIsFounder,
      };
    },
    staleTime: 1000 * 60 * 2,
  });
}

// =============================================
// FEATURE VOTING
// =============================================

interface FeatureRequest {
  id: string;
  title: string;
  description: string | null;
  status: string;
  vote_count: number;
  created_by: string | null;
  shipped_at: string | null;
  created_at: string;
}

export function useFeatureRequests() {
  return useQuery({
    queryKey: ['feature-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_requests')
        .select('*')
        .order('vote_count', { ascending: false });
      if (error) throw error;
      return data as FeatureRequest[];
    },
    staleTime: 1000 * 30,
  });
}

export function useMyFeatureVotes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-feature-votes', user?.id],
    queryFn: async () => {
      if (!user?.id) return new Set<string>();
      const { data, error } = await supabase
        .from('feature_votes')
        .select('feature_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return new Set(data.map(v => v.feature_id));
    },
    enabled: !!user?.id,
    select: normalizePersistedSet,
  });
}

export function useToggleFeatureVote() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ featureId, isVoted }: { featureId: string; isVoted: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');

      if (isVoted) {
        // Remove vote
        const { error } = await supabase
          .from('feature_votes')
          .delete()
          .eq('feature_id', featureId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        // Add vote
        const { error } = await supabase
          .from('feature_votes')
          .insert({ feature_id: featureId, user_id: user.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      queryClient.invalidateQueries({ queryKey: ['my-feature-votes'] });
    },
  });
}

export function useSubmitFeatureRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ title, description }: { title: string; description?: string }) => {
      const { error } = await supabase
        .from('feature_requests')
        .insert({
          title,
          description: description || null,
          created_by: profile?.id || null,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
    },
  });
}
