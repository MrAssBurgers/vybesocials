import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, user: { uid: 'alice' } as any, read: vi.fn(), index: vi.fn(), write: vi.fn(), authWrite: vi.fn(), provision: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => mock.session }));
vi.mock('./authService', () => ({ firebaseAuth: { get auth() { return { currentUser: mock.user }; } } }));
vi.mock('./profileResolve', () => ({ getProfileByAuthUid: (...args: unknown[]) => mock.read(...args), syncUserAuthIndex: (...args: unknown[]) => mock.index(...args), getProfilesByIds: vi.fn(), resolveProfileIdFromAuthUid: vi.fn() }));
vi.mock('./firestoreDb', () => ({ getDocument: vi.fn(), getDocuments: vi.fn(), updateDocument: (...args: unknown[]) => mock.write(...args), where: vi.fn(), orderBy: vi.fn(), firestoreLimit: vi.fn() }));
vi.mock('firebase/auth', () => ({ updateProfile: (...args: unknown[]) => mock.authWrite(...args) }));
vi.mock('@/lib/accountProfileService', () => ({ provisionAccountProfile: (...args: unknown[]) => mock.provision(...args) }));
import { ensureUserProfile, updateUserProfile } from './users';
import { syncProfileUsername } from './syncProfileUsername';
const owned = { id: 'legacy-alice', user_id: 'alice', username: 'alice' };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function switchAwayAndBack() { mock.session = { uid: 'alice', epoch: mock.session.epoch + 2 }; mock.user = { uid: 'alice' }; }
beforeEach(() => { vi.clearAllMocks(); mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.user = { uid: 'alice' }; mock.read.mockResolvedValue(owned); mock.write.mockResolvedValue(undefined); mock.index.mockResolvedValue(undefined); mock.authWrite.mockResolvedValue(undefined); mock.provision.mockResolvedValue({ profile: owned }); });
describe('nested profile write guards', () => {
  it('fresh provisioning goes through checked authority with safe defaults only', async () => {
    expect(await ensureUserProfile('alice', { username: 'alice', user_id: 'ignored', onboarding_completed: true })).toEqual(owned);
    expect(mock.provision).toHaveBeenCalledWith('alice', { defaults: { username: 'alice' } }, expect.any(Function));
    expect(mock.write).not.toHaveBeenCalled();
  });
  it('stops before any writes if ownership lookup returns after account ABA', async () => {
    const held = deferred<any>(); mock.read.mockReturnValueOnce(held.promise);
    const pending = updateUserProfile('alice', { bio: 'saved text' }); switchAwayAndBack(); held.resolve(owned);
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(mock.write).not.toHaveBeenCalled();
  });
  it('does not update a replacement Firebase user or further fields after delayed index sync', async () => {
    const held = deferred<void>(); mock.index.mockReturnValueOnce(held.promise);
    const pending = updateUserProfile('alice', { username: 'newname', bio: 'new bio' });
    await vi.waitFor(() => expect(mock.index).toHaveBeenCalledTimes(1));
    switchAwayAndBack(); held.resolve();
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' });
    expect(mock.authWrite).not.toHaveBeenCalled(); expect(mock.write).toHaveBeenCalledTimes(1);
    expect(mock.write).toHaveBeenCalledWith('profiles', owned.id, expect.objectContaining({ username: 'newname' }));
  });
  it('keeps an explicit retired view guard through username, index and final profile update', async () => {
    let active = true; const guard = () => { if (!active) throw new Error('retired view'); };
    const held = deferred<void>(); mock.write.mockReturnValueOnce(held.promise);
    const pending = updateUserProfile('alice', { username: 'newname', bio: 'text' }, guard);
    await vi.waitFor(() => expect(mock.write).toHaveBeenCalledTimes(1)); active = false; held.resolve();
    await expect(pending).rejects.toThrow('retired view'); expect(mock.index).not.toHaveBeenCalled(); expect(mock.authWrite).not.toHaveBeenCalled();
  });
  it('updates only the captured Firebase object after checked canonical index confirmation', async () => {
    const captured = mock.user; await syncProfileUsername('alice', 'New Name');
    expect(mock.index).toHaveBeenCalledWith('alice', owned.id, expect.any(Function));
    expect(mock.authWrite).toHaveBeenCalledWith(captured, { displayName: 'newname' });
  });
  it('rejects ownership fields and a foreign profile before writing', async () => {
    await expect(updateUserProfile('alice', { user_id: 'bob' })).rejects.toThrow('ownership');
    mock.read.mockResolvedValue({ ...owned, user_id: 'bob' });
    await expect(updateUserProfile('alice', { bio: 'text' })).rejects.toThrow('Profile not found'); expect(mock.write).not.toHaveBeenCalled();
  });
});
