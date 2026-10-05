import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, current: null as any, profiles: new Map<string, any>(), read: vi.fn(), claim: vi.fn(), ensure: vi.fn(), cache: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: (name: string) => name === 'claim_profile_by_email' ? state.claim() : state.ensure() } }));
vi.mock('@/lib/firebase/users', () => ({ getProfileByAuthUid: (...args: unknown[]) => state.read(...args) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => state.current, getCachedProfile: (id: string) => state.profiles.get(id), setCachedCurrentProfile: (value: unknown) => state.cache(value) }));
import { resetSessionProfileMemo, resolveSessionProfileId, resolveStoryAuthorProfileId, syncSessionProfileId } from './resolveSessionProfileId';
const owned = (uid = 'alice') => ({ id: `profile-${uid}`, user_id: uid, username: uid, display_name: uid, avatar_url: null });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function switchTo(uid?: string) { state.session = { uid, epoch: state.session.epoch + 1 }; }
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); resetSessionProfileMemo(); switchTo('alice'); state.current = null; state.profiles.clear(); state.claim.mockResolvedValue({ data: null, error: null }); state.ensure.mockResolvedValue({ data: null, error: null }); });
afterEach(() => { resetSessionProfileMemo(); vi.useRealTimers(); });
describe('account-scoped session profile resolution', () => {
  it('deduplicates the same account and times out without guessing its Auth UID', async () => {
    const held = deferred<any>(); state.read.mockReturnValueOnce(held.promise);
    const first = resolveSessionProfileId(), second = resolveSessionProfileId();
    expect(state.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2600);
    expect(await first).toBeUndefined(); expect(await second).toBeUndefined();
    state.read.mockResolvedValue(owned());
    expect(await resolveSessionProfileId()).toBe('profile-alice');
    held.resolve(null); await vi.advanceTimersByTimeAsync(0);
    expect(state.claim).not.toHaveBeenCalled(); expect(state.cache).toHaveBeenCalledTimes(1);
  });
  it('does not share an in-flight lookup or late cache update across accounts', async () => {
    const alice = deferred<any>(), bob = deferred<any>();
    state.read.mockReturnValueOnce(alice.promise).mockReturnValueOnce(bob.promise);
    const old = resolveSessionProfileId(); switchTo('bob'); const next = resolveSessionProfileId();
    alice.resolve(owned()); expect(await old).toBeUndefined();
    const joined = resolveSessionProfileId(); expect(state.read).toHaveBeenCalledTimes(2);
    bob.resolve(owned('bob')); expect(await next).toBe('profile-bob'); expect(await joined).toBe('profile-bob');
    expect(state.cache).toHaveBeenCalledTimes(1); expect(state.cache).toHaveBeenCalledWith(owned('bob'));
  });
  it('rejects account A-to-B-to-A even when the UID matches again', async () => {
    const held = deferred<any>(); state.read.mockReturnValueOnce(held.promise);
    const old = resolveSessionProfileId(); switchTo('bob'); switchTo('alice'); held.resolve(owned());
    expect(await old).toBeUndefined(); expect(state.cache).not.toHaveBeenCalled();
    state.read.mockResolvedValue(owned()); expect(await resolveSessionProfileId()).toBe('profile-alice');
  });
  it('reset retires old work without erasing the newer pending lookup', async () => {
    const oldRead = deferred<any>(), newRead = deferred<any>();
    state.read.mockReturnValueOnce(oldRead.promise).mockReturnValueOnce(newRead.promise);
    const old = resolveSessionProfileId(); resetSessionProfileMemo(); const next = resolveSessionProfileId();
    oldRead.resolve(owned()); expect(await old).toBeUndefined(); const joined = resolveSessionProfileId();
    expect(state.read).toHaveBeenCalledTimes(2); newRead.resolve(owned());
    expect(await next).toBe('profile-alice'); expect(await joined).toBe('profile-alice');
  });
  it('accepts only owner-bound cached identity and never a bare supplied ID', () => {
    state.current = { id: 'legacy', username: 'Someone' };
    expect(syncSessionProfileId()).toBeUndefined(); expect(syncSessionProfileId('profile-alice')).toBeUndefined();
    state.current = owned('bob'); expect(syncSessionProfileId()).toBeUndefined();
    state.current = owned(); expect(syncSessionProfileId()).toBe('profile-alice');
    switchTo(undefined); expect(syncSessionProfileId('profile-alice')).toBeUndefined();
  });
  it('rejects a foreign profile from the resolver without claiming or caching it', async () => {
    state.read.mockResolvedValue(owned('bob'));
    expect(await resolveSessionProfileId()).toBeUndefined(); expect(state.claim).not.toHaveBeenCalled(); expect(state.ensure).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled();
  });
  it('keeps missing-profile reads side-effect free and lets auth bootstrap finish', async () => {
    state.read.mockResolvedValueOnce(null).mockResolvedValueOnce(owned());
    await expect(resolveStoryAuthorProfileId()).rejects.toThrow('Could not load your profile');
    expect(state.claim).not.toHaveBeenCalled(); expect(state.ensure).not.toHaveBeenCalled();
    expect(state.cache).not.toHaveBeenCalled();
    expect(await resolveStoryAuthorProfileId()).toBe('profile-alice');
  });
  it('does not provision a missing profile after the account retires', async () => {
    const held = deferred<any>(); state.read.mockReturnValue(held.promise);
    const result = resolveSessionProfileId();
    switchTo('bob'); held.resolve(null); expect(await result).toBeUndefined();
    expect(state.claim).not.toHaveBeenCalled(); expect(state.ensure).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled();
  });
});
