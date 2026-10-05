import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), profile: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('./firebase/profileResolve', () => ({ resolveProfileIdFromAuthUid: state.profile }));
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (state.uid !== uid || epoch !== state.epoch) throw new Error('Account changed'); }; } }));
import { applyConfirmedPostView, recordCurrentPostView, recordPostView } from './postViewService';
const actor = { uid: 'alice', profileId: 'profile-a' }, receipt = { ok: true, ownerUid: 'alice', profileId: 'profile-a', postId: 'post-a', viewCount: 8, counted: true };
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch = 1; state.profile.mockResolvedValue('profile-a'); state.invoke.mockResolvedValue({ data: receipt, error: null }); });
describe('acknowledged post views', () => {
  it('sends bound identity and assigns the actual server count', async () => {
    const apply = vi.fn(); await applyConfirmedPostView(actor, 'post-a', () => {}, apply);
    expect(apply).toHaveBeenCalledExactlyOnceWith(8);
    expect(state.invoke).toHaveBeenCalledExactlyOnceWith('recordPostView', { expectedOwnerUid: 'alice', expectedProfileId: 'profile-a', postId: 'post-a' });
  });
  it.each([{ data: null, error: { message: 'Denied' } }, { data: null, error: null }, { data: { ...receipt, viewCount: -1 }, error: null }, { data: { ...receipt, ownerUid: 'bob' }, error: null }, { data: { ...receipt, postId: 'other' }, error: null }, { data: { ...receipt, counted: 'yes' }, error: null }])('never invents a count on failed or unverified receipt %j', async response => {
    state.invoke.mockResolvedValue(response); const apply = vi.fn(); await applyConfirmedPostView(actor, 'post-a', () => {}, apply); expect(apply).not.toHaveBeenCalled();
  });
  it('accepts a deduped current count without adding another local view', async () => {
    state.invoke.mockResolvedValue({ data: { ...receipt, counted: false }, error: null });
    const apply = vi.fn(); await applyConfirmedPostView(actor, 'post-a', () => {}, apply); expect(apply).toHaveBeenCalledExactlyOnceWith(8);
  });
  it('rejects old account or post callbacks after the request resolves', async () => {
    let active = true; state.invoke.mockImplementation(async () => { active = false; return { data: receipt, error: null }; });
    const apply = vi.fn(); await applyConfirmedPostView(actor, 'post-a', () => { if (!active) throw new Error('Retired'); }, apply); expect(apply).not.toHaveBeenCalled();
  });
  it('captures legacy alias identity before asynchronous resolution and refuses ABA', async () => {
    state.profile.mockImplementation(async () => { state.epoch += 2; return 'profile-a'; });
    await expect(recordCurrentPostView('post-a')).rejects.toThrow('Account changed'); expect(state.invoke).not.toHaveBeenCalled();
  });
  it('rejects transport failures rather than returning a fabricated success', async () => {
    state.invoke.mockRejectedValue(new Error('Offline')); await expect(recordPostView(actor, 'post-a', () => {})).rejects.toThrow('Offline');
  });
});
