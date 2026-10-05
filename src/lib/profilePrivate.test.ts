import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, set: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ setDocument: state.set }));
vi.mock('./profileAccountGuard', () => ({ profileAccountGuard: (uid: string, extra?: () => void) => {
  const epoch = state.epoch;
  const guard = () => { extra?.(); if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); };
  guard(); return guard;
} }));
import { savePrivateProfileDateOfBirth } from './profilePrivate';
const input = { authUid: 'alice', profileId: 'profile-alice', dateOfBirth: '2000-01-02' };
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.set.mockReset().mockResolvedValue(undefined); });
describe('private profile save', () => {
  it('writes the birthday to the canonical private profile only', async () => {
    await savePrivateProfileDateOfBirth(input);
    expect(state.set).toHaveBeenCalledWith('profile_private', 'profile-alice', { id: 'profile-alice', profile_id: 'profile-alice', user_id: 'alice', date_of_birth: '2000-01-02' });
  });
  it('rejects an already replaced account before writing', async () => {
    state.uid = 'bob'; await expect(savePrivateProfileDateOfBirth(input)).rejects.toThrow('Account changed');
    expect(state.set).not.toHaveBeenCalled();
  });
  it('does not acknowledge an old account write after return to the same UID', async () => {
    state.set.mockImplementation(async () => { state.epoch += 2; });
    await expect(savePrivateProfileDateOfBirth(input)).rejects.toThrow('Account changed');
  });
  it('checks view lifetime before writing', async () => {
    await expect(savePrivateProfileDateOfBirth(input, () => { throw new Error('Closed'); })).rejects.toThrow('Closed');
    expect(state.set).not.toHaveBeenCalled();
  });
});
