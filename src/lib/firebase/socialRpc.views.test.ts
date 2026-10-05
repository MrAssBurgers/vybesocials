import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ record: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/postViewService', () => ({ recordCurrentPostView: state.record }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: 'alice', epoch: 1 }), reportAccountGuard: () => () => {} }));
vi.mock('./firestoreDb', () => ({ getDocument: vi.fn(), getDocuments: vi.fn(), setDocument: vi.fn(), updateDocument: state.update, where: vi.fn(), firestoreLimit: vi.fn() }));
vi.mock('./authService', () => ({ firebaseAuth: {} }));
vi.mock('./users', () => ({ getUserProfile: vi.fn(), getUserProfileByUsername: vi.fn() }));
vi.mock('./profileResolve', () => ({ getProfileByAuthUid: vi.fn(), resolveProfileIdFromAuthUid: vi.fn() }));
import { runSocialRpc } from './socialRpc';
beforeEach(() => { vi.clearAllMocks(); });
describe('legacy view aliases use checked authority', () => {
  it.each(['increment_view_count', 'bump_post_impression'])('routes %s to one checked call without raw post updates', async name => {
    state.record.mockResolvedValue({ viewCount: 42, counted: false });
    expect(await runSocialRpc(name, { post_id_param: 'post-id' })).toBe(42);
    expect(state.record).toHaveBeenCalledExactlyOnceWith('post-id'); expect(state.update).not.toHaveBeenCalled();
  });
  it('does not fabricate a result when the current admission fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); state.record.mockRejectedValue(new Error('Unavailable'));
    expect(await runSocialRpc('increment_view_count', { post_id_param: 'post-id' })).toBeNull(); expect(state.update).not.toHaveBeenCalled(); warn.mockRestore();
  });
});
