import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streakReceipt } from '@/test/loginStreakFixture';
const state = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, profile: vi.fn(), rows: vi.fn(), doc: vi.fn(), write: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountGuard: (uid: string) => { const epoch = state.session.epoch; return () => { if (!uid || state.session.uid !== uid || state.session.epoch !== epoch) throw new Error('Account changed'); }; } }));
vi.mock('./firestoreDb', () => ({ getDocument: state.doc, getDocuments: state.rows, setDocument: state.write, updateDocument: state.write, where: (...args: unknown[]) => args, firestoreLimit: (n: number) => n }));
vi.mock('./authService', () => ({ firebaseAuth: {} }));
vi.mock('./users', () => ({ getUserProfile: vi.fn(), getUserProfileByUsername: vi.fn() }));
vi.mock('./profileResolve', () => ({ getProfileByAuthUid: (...args: unknown[]) => state.profile(...args), resolveProfileIdFromAuthUid: vi.fn() }));
vi.mock('@/lib/loginStreakService', () => ({ manageLoginStreak: (...args: unknown[]) => state.service(...args) }));
import { runSocialRpc } from './socialRpc';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: state.session.epoch + 1 }; state.profile.mockResolvedValue({ id: 'legacy-alice', user_id: 'alice' }); state.service.mockResolvedValue(streakReceipt()); });
describe('checked streak compatibility adapter', () => {
  it.each([['get_login_streak_status', 'read'], ['update_login_streak', 'track'], ['track_daily_login', 'track'], ['restore_login_streak', 'restore']])('routes %s without raw streak reads or writes', async (name, action) => {
    expect(await runSocialRpc(name, { p_timezone: 'UTC', expected_revision: 'a'.repeat(48) })).toMatchObject({ success: true, streak: 1, longest_streak: 1 });
    expect(state.service).toHaveBeenCalledWith({ uid: 'alice', profileId: 'legacy-alice' }, action, expect.any(Object), expect.any(Function));
    expect(state.rows).not.toHaveBeenCalled(); expect(state.doc).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
  });
  it('propagates checked errors instead of returning a successful null receipt', async () => {
    state.service.mockRejectedValue(new Error('Unavailable')); await expect(runSocialRpc('update_login_streak', {})).rejects.toThrow('Unavailable');
  });
  it('rejects a nested profile lookup after account ABA before dispatch', async () => {
    const held = deferred<any>(); state.profile.mockReturnValueOnce(held.promise);
    const pending = runSocialRpc('update_login_streak', {}); state.session = { uid: 'alice', epoch: state.session.epoch + 2 }; held.resolve({ id: 'legacy-alice', user_id: 'alice' });
    await expect(pending).rejects.toThrow('Account changed'); expect(state.service).not.toHaveBeenCalled();
  });
  it('rejects a foreign profile instead of allowing an alias to become the streak owner', async () => {
    state.profile.mockResolvedValueOnce({ id: 'legacy-bob', user_id: 'bob' }); await expect(runSocialRpc('update_login_streak', {})).rejects.toThrow('Load your profile'); expect(state.service).not.toHaveBeenCalled();
  });
});
