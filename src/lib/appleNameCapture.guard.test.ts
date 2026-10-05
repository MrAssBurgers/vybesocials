import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, user: { uid: 'alice', displayName: null } as any, authWrite: vi.fn(), profileWrite: vi.fn() }));
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => mock.session }));
vi.mock('./firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: mock.user }) }));
vi.mock('./firebase/users', () => ({ updateUserProfile: (...args: unknown[]) => mock.profileWrite(...args) }));
vi.mock('firebase/auth', () => ({ updateProfile: (...args: unknown[]) => mock.authWrite(...args) }));
import { applyAppleProvidedName, hasAppleSatisfiedName, stashAppleProvidedName } from './appleNameCapture';
const name = { firstName: 'Alice', lastName: 'Example', displayName: 'Alice Example' };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.user = { uid: 'alice', displayName: null }; mock.authWrite.mockResolvedValue(undefined); mock.profileWrite.mockResolvedValue(undefined); });
describe('bound Apple name capture', () => {
  it('updates by Auth UID while preserving a different legacy profile ID', async () => {
    const captured = mock.user;
    await applyAppleProvidedName({ authUid: 'alice', profileId: 'legacy-alice', name });
    expect(mock.authWrite).toHaveBeenCalledWith(captured, { displayName: name.displayName });
    expect(mock.profileWrite).toHaveBeenCalledWith('alice', expect.objectContaining({ display_name: name.displayName }), expect.any(Function));
  });
  it('never applies a name to another current account', async () => {
    mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; mock.user = { uid: 'bob' };
    await expect(applyAppleProvidedName({ authUid: 'alice', name })).rejects.toMatchObject({ code: 'account-changed' });
    expect(mock.authWrite).not.toHaveBeenCalled(); expect(mock.profileWrite).not.toHaveBeenCalled();
  });
  it('retires nested profile writes after delayed Auth metadata completion and ABA', async () => {
    let resolve!: () => void; mock.authWrite.mockReturnValue(new Promise<void>(r => { resolve = r; }));
    const pending = applyAppleProvidedName({ authUid: 'alice', name });
    mock.session = { uid: 'alice', epoch: mock.session.epoch + 2 }; mock.user = { uid: 'alice' }; resolve();
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(mock.profileWrite).not.toHaveBeenCalled();
  });
  it('does not treat an unowned historical name stash as the current Apple profile name', () => {
    stashAppleProvidedName(name);
    expect(hasAppleSatisfiedName({ user: { id: 'bob', identities: [{ provider: 'apple' }] } })).toBe(false);
  });
});
