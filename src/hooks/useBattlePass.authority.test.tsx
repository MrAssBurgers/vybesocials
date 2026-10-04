import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'player', currentUid: 'player', profileId: 'legacy', profileUid: 'player',
  read: vi.fn(), rpc: vi.fn(), credit: vi.fn(), epoch: 0, filters: [] as Array<[string, unknown]>, invalidate: vi.fn(), toast: vi.fn(), subscribe: vi.fn(), remove: vi.fn(), queryData: {} as Record<string, unknown> }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: { queryKey: string[] }) => ({ ...options, data: state.queryData[options.queryKey[0]] }),
  useMutation: (options: unknown) => options, useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: state.profileId, user_id: state.profileUid } }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => state.profileId }));
vi.mock('@/lib/challengeProgressClient', () => ({ syncChallengeProgressAfterActivity: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => ({ currentUser: { uid: state.currentUid } }), db: {
  rpc: state.rpc, from: () => {
    const query = {
      select: () => query,
      in: (field: string, value: unknown) => { state.filters.push([field, value]); return query; },
      eq: (field: string, value: unknown) => { state.filters.push([field, value]); return query; },
      order: () => query, single: () => state.read(), maybeSingle: () => state.read(),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => state.read().then(resolve, reject),
    }; return query;
  },
} }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: state.subscribe, removeRealtimeChannel: state.remove }));
vi.mock('sonner', () => ({ toast: { success: state.toast } }));
vi.mock('@/lib/navigationRef', () => ({ navigationRef: { current: vi.fn() } }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenMarketplaceRequest: state.credit, tokenAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (uid !== state.currentUid || epoch !== state.epoch) throw new Error('Account changed'); }; } }));
import { useUserLevel, useUnclaimedRewards, useClaimReward, useRealtimeChallengeRewards, useRealtimeLevelUpdates, type ChallengeReward } from './useBattlePass';
import { useChallengesWithProgress } from './useChallenges';
type Query<T> = { queryKey: string[]; enabled: boolean; queryFn: () => Promise<T> };
type Mutation = { mutationFn: (id: string) => Promise<Record<string, unknown>>; onSuccess: (result: Record<string, unknown>) => void };
const receipt = (id: string, uid = 'player', challenge = 'daily', claimed = false) => ({ id, user_id: uid, challenge_id: challenge, is_claimed: claimed, xp_amount: 25 }) as ChallengeReward;
beforeEach(() => {
  vi.clearAllMocks(); state.filters = []; state.uid = 'player'; state.currentUid = 'player'; state.profileId = 'legacy'; state.profileUid = 'player'; state.queryData = {};
  state.read.mockResolvedValue({ data: [], error: null }); state.rpc.mockResolvedValue({ data: { success: true, xp_gained: 25 }, error: null });
  state.subscribe.mockReturnValue({ topic: 'fixture' });
  state.epoch = 0; state.credit.mockResolvedValue({ success: true, balance: 25, credited: 25 });
});
describe('reward identity and replay presentation', () => {
  it('reads both aliases, coalesces unclaimed duplicates, and hides all aliases of a settled challenge', async () => {
    state.read.mockResolvedValue({ data: [receipt('auth'), receipt('legacy', 'legacy'), receipt('settled', 'legacy', 'old', true), receipt('old-auth', 'player', 'old'), receipt('foreign', 'other', 'other')], error: null });
    const { result } = renderHook(useUnclaimedRewards); const query = result.current as unknown as Query<ChallengeReward[]>;
    expect(query.queryKey).toEqual(['unclaimed-rewards', 'legacy', 'player']);
    expect(await query.queryFn()).toEqual([receipt('auth')]);
    expect(state.filters).toEqual([['user_id', ['player', 'legacy']]]);
  });
  it('uses one alias for native accounts and distinct account cache keys', async () => {
    state.profileId = 'player';
    const { result } = renderHook(useUnclaimedRewards); await (result.current as unknown as Query<ChallengeReward[]>).queryFn();
    expect(state.filters).toEqual([['user_id', ['player']]]);
    expect((result.current as unknown as Query<ChallengeReward[]>).queryKey).toEqual(['unclaimed-rewards', 'player', 'player']);
  });
  it('reads an existing migrated XP balance without provisioning a duplicate', async () => {
    state.read.mockResolvedValue({ data: { id: 'old-row', user_id: 'legacy', total_xp: 500, unclaimed_rewards: [] }, error: null });
    const { result } = renderHook(useUserLevel); const query = result.current as unknown as Query<Record<string, unknown>>;
    expect(query.queryKey).toEqual(['user-level', 'player', 'legacy']);
    expect(await query.queryFn()).toMatchObject({ total_xp: 500 });
    expect(state.filters).toEqual([['user_id', ['player', 'legacy']]]); expect(state.rpc).not.toHaveBeenCalled();
  });
  it('disables identity queries while a previous profile is still visible after account switching', async () => {
    state.uid = 'other'; state.currentUid = 'other';
    const { result } = renderHook(useUnclaimedRewards); const query = result.current as unknown as Query<ChallengeReward[]>;
    expect(query.enabled).toBe(false); expect(await query.queryFn()).toEqual([]); expect(state.read).not.toHaveBeenCalled();
  });
  it('invalidates the actual UID XP key and both challenge/receipt views after a claim', async () => {
    const { result } = renderHook(useClaimReward); const mutation = result.current as unknown as Mutation;
    const data = await mutation.mutationFn('reward'); mutation.onSuccess(data);
    expect(state.rpc).toHaveBeenCalledWith('claim_challenge_reward', { p_reward_id: 'reward' });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['user-level', 'player'] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['unclaimed-rewards', 'legacy', 'player'] });
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['claimed-rewards', 'player'] });
  });
  it('suppresses success effects after a claim finishes under a different current account', async () => {
    const { result } = renderHook(useClaimReward); const mutation = result.current as unknown as Mutation;
    const data = await mutation.mutationFn('reward'); state.currentUid = 'other'; mutation.onSuccess(data);
    expect(state.invalidate).not.toHaveBeenCalled(); expect(state.toast).not.toHaveBeenCalled();
  });
  it('credits only the returned verified challenge identity, never a parsed reward ID', async () => {
    state.rpc.mockResolvedValue({ data: { success: true, challenge_id: 'server-challenge', xp_gained: 25 }, error: null });
    const { result } = renderHook(useClaimReward); const mutation = result.current as unknown as Mutation;
    const data = await mutation.mutationFn('ambiguous_uid_and_challenge'); mutation.onSuccess(data);
    expect(state.credit).toHaveBeenCalledWith({ action: 'earn', type: 'challenge_completed', referenceId: 'server-challenge' }, expect.any(Function));
  });
  it('rejects unconfirmed rewards and account-switch completion before token earning', async () => {
    state.rpc.mockResolvedValue({ data: { success: false, challenge_id: 'forged' }, error: null });
    const { result } = renderHook(useClaimReward); const mutation = result.current as unknown as Mutation;
    await expect(mutation.mutationFn('reward')).rejects.toThrow('not confirmed');
    state.rpc.mockImplementation(async () => { state.epoch += 2; return { data: { success: true, challenge_id: 'daily' }, error: null }; });
    await expect(mutation.mutationFn('reward')).rejects.toThrow('Account changed');
    expect(state.credit).not.toHaveBeenCalled();
  });
  it('subscribes to both level identities and invalidates the UID key', () => {
    renderHook(useRealtimeLevelUpdates);
    const bindings = state.subscribe.mock.calls[0][1];
    expect(bindings.map((binding: { filter: string }) => binding.filter)).toEqual(['user_id=eq.player', 'user_id=eq.legacy']);
    bindings[0].callback({}); expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['user-level', 'player'] });
  });
  it('coalesces duplicate realtime notifications and ignores a completion after unmount', async () => {
    const callback = vi.fn(); state.read.mockResolvedValue({ data: receipt('auth'), error: null });
    const { unmount } = renderHook(() => useRealtimeChallengeRewards(callback));
    const bindings = state.subscribe.mock.calls[0][1];
    expect(bindings.map((binding: { filter: string }) => binding.filter)).toEqual(['user_id=eq.player', 'user_id=eq.legacy']);
    const event = { eventType: 'INSERT', new: receipt('auth') };
    await bindings[0].callback(event); await bindings[1].callback(event); expect(callback).toHaveBeenCalledTimes(1);
    let finish: (value: unknown) => void = () => {};
    state.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = bindings[0].callback({ eventType: 'INSERT', new: receipt('other', 'player', 'other') });
    unmount(); finish({ data: receipt('other', 'player', 'other'), error: null }); await pending;
    expect(callback).toHaveBeenCalledTimes(1); expect(state.toast).toHaveBeenCalledTimes(1);
  });
  it('marks a challenge claimed when any legacy alias is settled, regardless of row order', () => {
    state.queryData = { challenges: [{ id: 'daily', type: 'daily' }], 'challenge-progress': [], 'claimed-rewards': [receipt('false'), receipt('true', 'legacy', 'daily', true)] };
    const { result } = renderHook(useChallengesWithProgress);
    expect(result.current.daily[0]?.is_claimed).toBe(true);
  });
});
