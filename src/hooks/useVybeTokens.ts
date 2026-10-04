import { useTokenAction, useTokenMarketplaceState } from './useTokenMarketplaceState';
import { tokenMarketplaceRequest, type TokenEarnType } from '@/lib/tokenMarketplaceService';
export type { TokenBalance, TokenTransaction } from '@/lib/tokenMath';
export { parseTokenBalance } from '@/lib/tokenMath';

/** Base verified rewards; daily limits and multipliers are enforced by the server. */
export const TOKEN_RATES = { post_created: 10, comment_added: 2, challenge_completed: 25, daily_login: 3 } as const;
export const TOKEN_DAILY_LIMITS = { post_created: 3, comment_added: 10, challenge_completed: 5, daily_login: 1 } as const;

export function useTokenBalance() {
  const state = useTokenMarketplaceState();
  return { ...state, data: state.isError ? undefined : state.data?.wallet, legacyReview: state.data?.legacy_review ?? false };
}
export function useTokenTransactions(limit = 20) {
  const state = useTokenMarketplaceState();
  return { ...state, data: state.isError ? undefined : state.data?.transactions.slice(0, limit), legacyReview: state.data?.legacy_review ?? false };
}
export function useEarnTokens() {
  return useTokenAction(({ type, referenceId }: { type: TokenEarnType; referenceId?: string }, guard) =>
    tokenMarketplaceRequest({ action: 'earn', type, referenceId }, guard));
}
export function useTokenReward() {
  const earn = useEarnTokens();
  return {
    rewardPost: (referenceId: string) => earn.mutate({ type: 'post_created', referenceId }),
    rewardComment: (referenceId: string) => earn.mutate({ type: 'comment_added', referenceId }),
    rewardChallenge: (referenceId: string) => earn.mutate({ type: 'challenge_completed', referenceId }),
    rewardDailyLogin: () => earn.mutate({ type: 'daily_login' }),
    earn,
  };
}
