import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, profile: vi.fn(), rows: vi.fn(), doc: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountGuard: (uid: string) => { const epoch = state.session.epoch; return () => { if (!uid || state.session.uid !== uid || state.session.epoch !== epoch) throw new Error('Account changed'); }; } }));
vi.mock('./firestoreDb', () => ({ getDocument: state.doc, getDocuments: state.rows, setDocument: state.write, updateDocument: vi.fn(), where: (...args: unknown[]) => args, firestoreLimit: (n: number) => n }));
vi.mock('./authService', () => ({ firebaseAuth: {} }));
vi.mock('./users', () => ({ getUserProfile: vi.fn(), getUserProfileByUsername: vi.fn() }));
vi.mock('./profileResolve', () => ({ getProfileByAuthUid: (...args: unknown[]) => state.profile(...args), resolveProfileIdFromAuthUid: vi.fn() }));
import { runSocialRpc } from './socialRpc';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'warn').mockImplementation(() => {}); state.session = { uid: 'alice', epoch: state.session.epoch + 1 }; state.profile.mockResolvedValue({ id: 'legacy-alice', user_id: 'alice' }); state.rows.mockResolvedValue([]); state.doc.mockResolvedValue(null); state.write.mockResolvedValue(undefined); });
describe('streak adapter bound identity', () => {
  it('creates an actual streak for the captured canonical owner', async () => {
    expect(await runSocialRpc('update_login_streak', {})).toMatchObject({ success: true, streak: 1 });
    expect(state.write).toHaveBeenCalledWith('login_streaks', 'alice', expect.objectContaining({ user_id: 'alice', profile_id: 'legacy-alice', current_streak: 1 }));
  });
  it.each(['update_login_streak', 'restore_login_streak'])('stops %s after a nested read completes following account ABA', async action => {
    const held = deferred<any[]>(); state.rows.mockReturnValueOnce(held.promise);
    const pending = runSocialRpc(action, {}); await vi.waitFor(() => expect(state.rows).toHaveBeenCalledTimes(1));
    state.session = { uid: 'alice', epoch: state.session.epoch + 2 }; held.resolve([]);
    await expect(pending).resolves.toBeNull(); expect(state.doc).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
  });
  it('does not start streak reads or writes after delayed profile resolution and logout', async () => {
    const held = deferred<any>(); state.profile.mockReturnValueOnce(held.promise);
    const pending = runSocialRpc('update_login_streak', {}); state.session = { uid: undefined, epoch: state.session.epoch + 1 }; held.resolve({ id: 'legacy-alice', user_id: 'alice' });
    await expect(pending).resolves.toBeNull(); expect(state.rows).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
  });
  it('never rewrites a foreign streak row returned by a legacy document lookup', async () => {
    state.doc.mockResolvedValueOnce({ id: 'alice', user_id: 'bob', current_streak: 5 });
    await expect(runSocialRpc('update_login_streak', {})).resolves.toBeNull(); expect(state.write).not.toHaveBeenCalled();
  });
});
