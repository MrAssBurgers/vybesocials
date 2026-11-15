import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({ profileId: 'profile-a', request: vi.fn(), session: { uid: 'auth-a', epoch: 1 } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: fixture.profileId } }) }));
vi.mock('./useCommunitySession', () => ({ useCommunitySession: () => ({ uid: 'auth-a', session: fixture.session }) }));
vi.mock('@/lib/communityService', () => ({ communityAccountLease: () => () => {}, communityRequest: fixture.request }));
import { useCommunityRequest } from './useCommunityRequest';
beforeEach(() => { fixture.profileId = 'profile-a'; fixture.request.mockReset(); fixture.request.mockResolvedValue({ ok: true }); });
describe('community request profile binding', () => {
  it('carries the profile that created the action even after a later render', async () => {
    const hook = renderHook(() => useCommunityRequest()); const retained = hook.result.current;
    fixture.profileId = 'profile-b'; hook.rerender();
    await retained('community-manage', { action: 'listMine' });
    expect(fixture.request).toHaveBeenLastCalledWith('community-manage', { action: 'listMine', expectedProfileId: 'profile-a' }, expect.any(Function));
    await hook.result.current('community-manage', { action: 'listMine' });
    expect(fixture.request).toHaveBeenLastCalledWith('community-manage', { action: 'listMine', expectedProfileId: 'profile-b' }, expect.any(Function));
  });
});
