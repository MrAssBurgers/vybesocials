import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useDNAPerks } from '@/hooks/useDNAPerks';

export interface TokenBalance {
  id: string;
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at: string;
}

export interface TokenTransaction {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

// Token earning rates
export const TOKEN_RATES = {
  post_created: 10,
  comment_added: 2,
  like_received: 1,
  streak_bonus: 5,
  challenge_completed: 25,
  daily_login: 3,
  invite_accepted: 50,
  quiz_completed: 15,
} as const;

export function useTokenBalance() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['vybe-tokens', user?.id],
    queryFn: async (): Promise<TokenBalance | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('vybe_tokens' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      // Return default if no record exists
      const typedData = data as unknown as TokenBalance | null;
      if (!typedData) {
        return {
          id: '',
          user_id: user.id,
          balance: 0,
          lifetime_earned: 0,
          lifetime_spent: 0,
        updated_at: new Date().toISOString(),
        };
      }
      
      return typedData;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

export function useTokenTransactions(limit = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['token-transactions', user?.id, limit],
    queryFn: async (): Promise<TokenTransaction[]> => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('token_transactions' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as TokenTransaction[];
    },
    enabled: !!user?.id,
  });
}

export function useEarnTokens() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      amount, 
      type, 
      description, 
      referenceId 
    }: { 
      amount: number; 
      type: keyof typeof TOKEN_RATES | string; 
      description?: string; 
      referenceId?: string 
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('earn_vybe_tokens', {
        p_user_id: user.id,
        p_amount: amount,
        p_type: type,
        p_description: description || null,
        p_reference_id: referenceId || null,
      });

      if (error) throw error;
      return data as number; // Returns new balance
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vybe-tokens', user?.id] });
      qc.invalidateQueries({ queryKey: ['token-transactions', user?.id] });
    },
  });
}

/**
 * Convenience hook to earn tokens for common actions
 */
export function useTokenReward() {
  const earn = useEarnTokens();
  const perks = useDNAPerks();

  // Apply DNA token multiplier to all earnings
  const applyMultiplier = (base: number) => Math.round(base * perks.tokenMultiplier);

  return {
    rewardPost: () => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.post_created), type: 'post_created', description: 'Created a post' }),
    rewardComment: () => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.comment_added), type: 'comment_added', description: 'Added a comment' }),
    rewardLike: () => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.like_received), type: 'like_received', description: 'Received a like' }),
    rewardStreak: (days: number) => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.streak_bonus * days), type: 'streak_bonus', description: `${days}-day streak bonus` }),
    rewardChallenge: (name: string) => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.challenge_completed), type: 'challenge_completed', description: `Completed: ${name}` }),
    rewardDailyLogin: () => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.daily_login), type: 'daily_login', description: 'Daily login bonus' }),
    rewardInvite: () => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.invite_accepted), type: 'invite_accepted', description: 'Friend accepted invite' }),
    rewardQuiz: () => earn.mutate({ amount: applyMultiplier(TOKEN_RATES.quiz_completed), type: 'quiz_completed', description: 'Completed personality quiz' }),
    earn,
    perks,
  };
}
