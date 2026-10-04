import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rpc: vi.fn(), toast: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: state.rpc } }));
vi.mock('sonner', () => ({ toast: { success: state.toast, error: vi.fn() } }));

import { claimChallengeRewardOnce, resetChallengeClaimsForTests } from './challengeClaimOnce';

beforeEach(() => {
  resetChallengeClaimsForTests();
  state.rpc.mockReset();
  state.toast.mockReset();
  state.rpc.mockResolvedValue({ data: { success: true, xp_gained: 10 }, error: null });
});

describe('one challenge claim toast', () => {
  it('claims each reward once and keeps a single toast when several finish together', async () => {
    const first = claimChallengeRewardOnce('uid_daily', 10, 'daily');
    const duplicate = claimChallengeRewardOnce('uid_daily', 10, 'daily');
    const second = claimChallengeRewardOnce('uid_weekly', 15, 'weekly');
    const third = claimChallengeRewardOnce('legacy_weekly', 15, 'weekly');
    expect(third).toBe(second);
    expect(duplicate).toBe(first);
    await Promise.all([first, second, third]);
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.toast).toHaveBeenCalledTimes(2);
    expect(state.toast).toHaveBeenLastCalledWith('+25 XP claimed', expect.objectContaining({ id: 'vybe-challenge-claim' }));
  });
});
