import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ epoch: 1, auth: vi.fn(), resolve: vi.fn(), normalize: vi.fn(), sync: vi.fn(), existing: vi.fn(), repair: vi.fn(), profile: vi.fn(), write: vi.fn() }));
vi.mock('./authService', () => ({ firebaseAuth: { getUser: state.auth } }));
vi.mock('./profileResolve', () => ({ resolveProfileIdFromAuthUid: state.resolve, syncUserAuthIndex: state.sync }));
vi.mock('./users', () => ({ getUserProfile: state.profile }));
vi.mock('./firestoreDb', () => ({ getDocument: vi.fn(), getDocuments: vi.fn(), setDocument: state.write, updateDocument: vi.fn(), where: vi.fn(), orderBy: vi.fn() }));
vi.mock('@/lib/dmMembershipRepair', () => ({ normalizeToProfileId: state.normalize, findExistingDmBetweenProfiles: state.existing, ensureDmMembershipPair: state.repair }));
vi.mock('@/lib/markConversationRead', () => ({}));
import { createDmChat } from './chats';
const guard = () => { if (state.epoch !== 1) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

beforeEach(() => { state.epoch = 1; for (const fn of [state.auth, state.resolve, state.normalize, state.sync, state.existing, state.repair, state.profile, state.write]) fn.mockReset();
  state.auth.mockResolvedValue({ data: { user: { id: 'alice' } } }); state.resolve.mockResolvedValue('alice-profile'); state.normalize.mockResolvedValue('bob-profile');
  state.existing.mockResolvedValue(null); state.profile.mockResolvedValue({ user_id: 'bob' }); state.write.mockResolvedValue(undefined);
});
describe('guarded conversation creation', () => {
  it('keeps legitimate creation compatible with a captured session', async () => {
    await expect(createDmChat('bob', guard)).resolves.toBe('alice-profile_bob-profile');
    expect(state.write.mock.calls[0]).toEqual(['conversations', 'alice-profile_bob-profile', expect.objectContaining({ created_by: 'alice-profile' })]);
    expect(state.write.mock.calls.slice(1).every((call) => call[2].role === 'member')).toBe(true);
    expect(state.write).toHaveBeenCalledTimes(5);
  });
  it('stops before profile resolution when the Auth lookup returns in another account', async () => {
    const auth = deferred<unknown>(); state.auth.mockReturnValue(auth.promise);
    const pending = createDmChat('bob', guard); state.epoch++; auth.resolve({ data: { user: { id: 'mallory' } } });
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(state.resolve).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
  });
  it('does not repair membership after a stale existing-chat lookup', async () => {
    const existing = deferred<string>(); state.existing.mockReturnValue(existing.promise);
    const pending = createDmChat('bob', guard); await vi.waitFor(() => expect(state.existing).toHaveBeenCalled()); state.epoch++; existing.resolve('chat');
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); expect(state.repair).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
  });
  it('does not continue member writes after an account change during the first write', async () => {
    state.write.mockImplementationOnce(async () => { state.epoch++; });
    await expect(createDmChat('bob', guard)).rejects.toMatchObject({ code: 'account-changed' }); expect(state.write).toHaveBeenCalledTimes(1);
  });
});
