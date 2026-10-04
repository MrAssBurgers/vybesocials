import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), rows: [] as Array<{ role: string }> }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => options, useMutation: vi.fn(), useQueryClient: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ authReady: true, user: { id: 'ordinary-user' } }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => 'legacy-profile' }));
vi.mock('@/lib/previewSandbox', () => ({ isFounderAuthId: () => false, isPreviewFounderUser: () => false }));
vi.mock('@/lib/edgeFeature', () => ({ invokeEdgeFeature: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: mocks.rpc, from: mocks.from } }));

import { useUserRole } from './useModeration';
const query = () => {
  const { result } = renderHook(() => useUserRole());
  return (result.current as unknown as { queryFn: () => Promise<string | null> }).queryFn();
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows = [];
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  mocks.from.mockImplementation((table: string) => ({
    select: () => ({ eq: async () => ({ data: table === 'user_badges' ? [{ badge_name: 'owner' }, { badge_name: 'admin' }] : mocks.rows, error: null }) }),
  }));
});

describe('staff UI authority excludes presentation badges', () => {
  it('ignores forged/imported owner and admin badges when no staff role exists', async () => {
    expect(await query()).toBeNull();
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['user_roles', 'user_roles_auth']);
  });
  it('does not use badges as authority when the primary role lookup fails', async () => {
    mocks.rpc.mockRejectedValue(new Error('Unavailable'));
    expect(await query()).toBeNull();
    expect(mocks.from).not.toHaveBeenCalledWith('user_badges');
  });
  it('preserves legitimate role grants', async () => {
    mocks.rows = [{ role: 'moderator' }];
    expect(await query()).toBe('moderator');
  });
  it('preserves a successful primary staff role result', async () => {
    mocks.rpc.mockResolvedValue({ data: 'admin', error: null });
    expect(await query()).toBe('admin');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
