import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ uid: 'staff' as string | undefined, currentUid: 'staff' as string | undefined, rpc: vi.fn(), from: vi.fn(), invalidate: vi.fn(), in: vi.fn(), eq: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useMutation: (options: unknown) => options, useQuery: vi.fn(), useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mocks.uid ? { id: mocks.uid } : null, profile: { id: 'legacy-staff' } }) }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: mocks.rpc, from: mocks.from }, getFirebaseAuth: () => ({ currentUser: mocks.currentUid ? { uid: mocks.currentUid } : null }) }));
import { useAwardBadge, useRemoveBadge, useUpdateBadgeSettings } from './useBadges';
type Input = { userId: string; badgeId: string; expiresAt?: string };
type Mutation = { mutationFn: (data: Input) => Promise<unknown>; onSuccess: (data: unknown, variables: Input) => void };
beforeEach(() => {
  vi.clearAllMocks(); mocks.uid = 'staff'; mocks.currentUid = 'staff'; mocks.rpc.mockResolvedValue({ data: { success: true }, error: null });
  mocks.eq.mockResolvedValue({ error: null }); mocks.in.mockReturnValue({ eq: mocks.eq }); mocks.from.mockReturnValue({ update: () => ({ in: mocks.in }) });
});
describe('badge mutation migration', () => {
  it.each([[useAwardBadge, 'award_badge'], [useRemoveBadge, 'revoke_badge']] as const)('uses protected callable %s and invalidates both badge views', async (hook, rpc) => {
    const { result } = renderHook(hook); const mutation = result.current as unknown as Mutation;
    const input = { userId: 'target', badgeId: 'earned' }; const data = await mutation.mutationFn(input);
    expect(mocks.rpc).toHaveBeenCalledWith(rpc, { p_user_id: 'target', p_badge_id: 'earned', ...(rpc === 'award_badge' ? { p_expires_at: null } : {}) });
    expect(mocks.from).not.toHaveBeenCalled(); mutation.onSuccess(data, input);
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['user-badges', 'target'] });
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ['user-primary-badge', 'target'] });
  });
  it.each([useAwardBadge, useRemoveBadge])('does not hide permission failures', async hook => {
    mocks.rpc.mockResolvedValue({ error: new Error('Admin only') });
    const { result } = renderHook(hook);
    await expect((result.current as unknown as Mutation).mutationFn({ userId: 'target', badgeId: 'earned' })).rejects.toThrow('Admin only');
  });
  it.each([useAwardBadge, useRemoveBadge])('prevents a stale account mutation', async hook => {
    const { result } = renderHook(hook); mocks.currentUid = 'other';
    await expect((result.current as unknown as Mutation).mutationFn({ userId: 'target', badgeId: 'earned' })).rejects.toThrow('Sign in again');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([useAwardBadge, useRemoveBadge])('rejects unconfirmed responses', async hook => {
    mocks.rpc.mockResolvedValue({ data: { success: false }, error: null });
    const { result } = renderHook(hook);
    await expect((result.current as unknown as Mutation).mutationFn({ userId: 'target', badgeId: 'earned' })).rejects.toThrow('not confirmed');
  });
  it.each([useAwardBadge, useRemoveBadge])('suppresses stale success after account changes during the request', async hook => {
    mocks.rpc.mockImplementation(async () => { mocks.currentUid = 'other'; return { data: { success: true }, error: null }; });
    const { result } = renderHook(hook);
    await expect((result.current as unknown as Mutation).mutationFn({ userId: 'target', badgeId: 'earned' })).rejects.toThrow('Account changed');
    (result.current as unknown as Mutation).onSuccess({ actorUid: 'staff' }, { userId: 'target', badgeId: 'earned' });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it('updates display preferences for native and migrated grant owners', async () => {
    const { result } = renderHook(useUpdateBadgeSettings);
    await (result.current as unknown as { mutationFn: (input: unknown) => Promise<unknown> }).mutationFn({ badgeId: 'earned', updates: { show_effect: false } });
    expect(mocks.in).toHaveBeenCalledWith('user_id', ['legacy-staff', 'staff']);
    expect(mocks.eq).toHaveBeenCalledWith('badge_id', 'earned');
  });
});
