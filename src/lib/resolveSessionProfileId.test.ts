import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const getProfileByAuthUid = vi.fn();
const getSession = vi.fn();
const claimRpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
const ensureRpc = vi.fn(() => Promise.resolve({ data: null, error: null }));

vi.mock('@/lib/firebase', () => ({
  db: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
    },
    rpc: (name: string) => (name === 'claim_profile_by_email' ? claimRpc() : ensureRpc()),
  },
}));

vi.mock('@/lib/firebase/users', () => ({
  getProfileByAuthUid: (...args: unknown[]) => getProfileByAuthUid(...args),
}));

vi.mock('@/lib/firebase/profileResolve', () => ({
  syncUserAuthIndex: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/profileCache', () => ({
  getEffectiveProfileId: vi.fn(() => undefined),
  setCachedCurrentProfile: vi.fn(),
}));

import {
  resetSessionProfileMemo,
  resolveSessionProfileId,
} from '@/lib/resolveSessionProfileId';

describe('resolveSessionProfileId hang protection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSessionProfileMemo();
    vi.clearAllMocks();
    getSession.mockResolvedValue({ data: { session: { user: { id: 'auth-uid-1' } } } });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSessionProfileMemo();
  });

  it('clears inflight and returns auth uid when Firestore never settles', async () => {
    getProfileByAuthUid.mockImplementation(() => new Promise(() => {}));

    const p1 = resolveSessionProfileId(null);
    const p2 = resolveSessionProfileId(null);

    await vi.advanceTimersByTimeAsync(2600);
    const [a, b] = await Promise.all([p1, p2]);

    expect(a).toBe('auth-uid-1');
    expect(b).toBe('auth-uid-1');

    // Inflight cleared — a later call starts a fresh attempt.
    getProfileByAuthUid.mockResolvedValue({
      id: 'prof-1',
      username: 'realuser',
      display_name: 'Real',
      avatar_url: null,
    });
    const p3 = resolveSessionProfileId(null);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p3).resolves.toBe('prof-1');
  });
});
