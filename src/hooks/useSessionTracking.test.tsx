import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  uid: 'alice', epoch: 1, gate: false, authTime: 1_780_001_000, created: 1_780_000_000_000,
  user: null as null | { id: string }, profile: null as null | { id: string; user_id: string },
  native: null as null | { uid: string; email: string; metadata: { creationTime: string; lastSignInTime: string }; getIdTokenResult: ReturnType<typeof vi.fn> },
  invoke: vi.fn(), read: vi.fn(), signOut: vi.fn(), ids: [] as string[], clearGate: vi.fn(), setGate: vi.fn(),
}));
const live = vi.hoisted(() => ({ get currentUser() { return state.native; } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile, authReady: true }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => live }));
vi.mock('@/lib/tokenMarketplaceService', () => ({ tokenAccountGuard: (uid: string) => {
  const epoch = state.epoch; return () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('Retired account'); };
} }));
vi.mock('@/lib/firebase', () => ({ db: {
  functions: { invoke: state.invoke }, auth: { signOut: state.signOut },
  from: () => ({ select: () => ({ eq: (_field: string, id: string) => { state.ids.push(id); return { maybeSingle: state.read }; } }) }),
} }));
vi.mock('@/lib/notifications/pushDiagnostics', () => ({ getOrCreateDeviceId: () => 'device-one' }));
vi.mock('@/lib/loginApprovalGate', () => ({ shouldBlockPostLoginNavigation: () => state.gate, clearPendingLoginApproval: state.clearGate, setPendingLoginApproval: state.setGate }));
import { notifyFreshLogin, useSessionTracking } from './useSessionTracking';
import { captureDeviceSignIn, registerCurrentDevice, signOutIfCurrentDeviceRevoked } from '@/lib/loginDeviceService';

const response = (patch = {}) => ({ ok: true, ownerUid: 'alice', profileId: 'profile-alice', authTime: state.authTime, accountCreatedAt: state.created,
  trackingDeferred: false, sessionId: 'fresh-device-generation', requiresApproval: false, reason: 'known_session', ...patch });
const pendingError = () => ({ code: 'functions/failed-precondition', details: { ownerUid: 'alice', authTime: state.authTime, accountCreatedAt: state.created, reason: 'sign-in-confirmation-pending' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); state.ids = []; state.uid = 'alice'; state.epoch++; state.gate = false;
  state.user = { id: 'alice' }; state.profile = { id: 'profile-alice', user_id: 'alice' };
  state.native = { uid: 'alice', email: 'alice@example.test', metadata: { creationTime: new Date(state.created).toISOString(), lastSignInTime: new Date(state.authTime * 1000).toISOString() }, getIdTokenResult: vi.fn(async () => ({ claims: { auth_time: state.authTime } })) };
  state.invoke.mockResolvedValue({ data: response(), error: null }); state.read.mockResolvedValue({ data: null, error: null });
  state.signOut.mockImplementation(async ({ guard }: { guard: () => void }) => { guard(); return { error: null }; });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('checked device sign-in and current revocation', () => {
  it('requires the exact checked email completion before retaining a device session', async () => {
    state.invoke.mockResolvedValue({ data: response({ confirmedEmailChallengeId: 'email-challenge' }), error: null });
    await expect(notifyFreshLogin('email_2fa', () => {}, 'email-challenge')).resolves.toMatchObject({ requiresApproval: false, sessionId: 'fresh-device-generation' });
    expect(state.invoke).toHaveBeenCalledWith('auth-login-notify', expect.objectContaining({ body: expect.objectContaining({ method: 'email_2fa', expectedEmailChallengeId: 'email-challenge' }) }));
    expect(localStorage.getItem('vybe-app-session-id-alice-device-one')).toBe('fresh-device-generation');
  });
  it('lets the confirming modal clear its gate only after guarded hydration finishes', async () => {
    state.invoke.mockResolvedValue({ data: response({ confirmedEmailChallengeId: 'email-challenge' }), error: null });
    await notifyFreshLogin('email_2fa', () => {}, 'email-challenge', true);
    expect(state.clearGate).not.toHaveBeenCalled();
  });
  it.each([{}, { confirmedEmailChallengeId: 'other' }, { confirmedEmailChallengeId: 'email-challenge', requiresApproval: true },
    { confirmedEmailChallengeId: 'email-challenge', trackingDeferred: true, profileId: null, sessionId: null, reason: 'profile_setup_pending' }])('rejects email completion without its confirmed device receipt %j', async patch => {
    state.invoke.mockResolvedValue({ data: response(patch), error: null });
    await expect(notifyFreshLogin('email_2fa', () => {}, 'email-challenge')).rejects.toThrow('not confirmed');
    expect(state.clearGate).not.toHaveBeenCalled();
    expect(localStorage.getItem('vybe-app-session-id-alice-device-one')).toBeNull();
  });
  it('does not clear confirmation or save a device after its outer sign-in attempt retires', async () => {
    const pending = deferred<unknown>(); state.invoke.mockReturnValue(pending.promise); let current = true;
    const result = notifyFreshLogin('email_2fa', () => { if (!current) throw Error('Retired sign-in'); }, 'email-challenge');
    const rejected = expect(result).rejects.toThrow('Retired sign-in');
    await waitFor(() => expect(state.invoke).toHaveBeenCalledOnce()); current = false;
    pending.resolve({ data: response({ confirmedEmailChallengeId: 'email-challenge' }), error: null }); await rejected;
    expect(state.clearGate).not.toHaveBeenCalled(); expect(localStorage.getItem('vybe-app-session-id-alice-device-one')).toBeNull();
  });
  it('continues when device registration acknowledges approval without issuing a challenge', async () => {
    state.invoke.mockResolvedValue({ data: response({ requiresApproval: true }), error: null });
    const signIn = await captureDeviceSignIn('alice');
    await expect(registerCurrentDevice(signIn, 'device-one', 'password')).resolves.toMatchObject({ requiresApproval: false, challengeId: undefined, sessionId: 'fresh-device-generation' });
    expect(state.setGate).not.toHaveBeenCalled();
  });
  it.each([{ ownerUid: 'bob' }, { authTime: 1 }, { accountCreatedAt: 1 }, { profileId: null }, { requiresApproval: true, challengeId: 'challenge-one' }, { trackingDeferred: true }])('rejects an incomplete or mismatched receipt %j', async patch => {
    state.invoke.mockResolvedValue({ data: response(patch), error: null });
    const signIn = await captureDeviceSignIn('alice');
    await expect(registerCurrentDevice(signIn, 'device-one', 'password')).rejects.toThrow('not confirmed');
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it('accepts only the explicit fresh-account deferral and does not invent a device ID', async () => {
    state.invoke.mockResolvedValue({ data: response({ trackingDeferred: true, profileId: null, sessionId: null, reason: 'profile_setup_pending' }), error: null });
    const result = await notifyFreshLogin('oauth');
    expect(result.sessionId).toBeUndefined(); expect(result.requiresApproval).toBe(false);
    expect(localStorage.getItem('vybe-app-session-id-alice-device-one')).toBeNull();
  });
  it('never treats a failed interactive confirmation as approval', async () => {
    state.invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(notifyFreshLogin('password')).rejects.toThrow('offline');
    expect(state.clearGate).not.toHaveBeenCalled(); expect(state.setGate).not.toHaveBeenCalled();
  });
  it('does not let an old revoked generation sign out newer verified credentials', async () => {
    const signIn = await captureDeviceSignIn();
    state.read.mockResolvedValue({ data: { user_id: 'alice', session_token_hash: 'device-one', revoked_at: new Date((state.authTime - 1) * 1000).toISOString() }, error: null });
    expect(await signOutIfCurrentDeviceRevoked(signIn, 'device-one', 'old-generation')).toBe(false);
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it('signs out only the current credential after a matching authoritative revoke', async () => {
    const signIn = await captureDeviceSignIn();
    state.read.mockResolvedValue({ data: { user_id: 'alice', session_token_hash: 'device-one', revoked_at: new Date(state.authTime * 1000).toISOString() }, error: null });
    expect(await signOutIfCurrentDeviceRevoked(signIn, 'device-one', 'current-generation')).toBe(true);
    expect(state.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local', guard: signIn.guard });
  });
  it('retires a pending old-account registration even across A→B→A', async () => {
    const work = deferred<{ data: ReturnType<typeof response>; error: null }>(); state.invoke.mockReturnValue(work.promise);
    const call = notifyFreshLogin('password'); const rejected = expect(call).rejects.toThrow('Retired account');
    await waitFor(() => expect(state.invoke).toHaveBeenCalledOnce()); state.epoch += 2;
    work.resolve({ data: response(), error: null }); await rejected;
    expect(localStorage.getItem('vybe-app-session-id-alice-device-one')).toBeNull(); expect(state.clearGate).not.toHaveBeenCalled();
  });
  it('ignores a revoke read after same-UID reauthentication changes the verified token time', async () => {
    const signIn = await captureDeviceSignIn();
    state.read.mockResolvedValue({ data: { user_id: 'alice', session_token_hash: 'device-one', revoked_at: new Date(state.authTime * 1000).toISOString() }, error: null });
    state.native!.getIdTokenResult.mockResolvedValue({ claims: { auth_time: state.authTime + 1 } });
    expect(await signOutIfCurrentDeviceRevoked(signIn, 'device-one', 'old-generation')).toBe(false); expect(state.signOut).not.toHaveBeenCalled();
  });
});

describe('mounted resume watcher', () => {
  it('waits for canonical profile setup and never races an in-progress interactive confirmation', async () => {
    vi.useFakeTimers(); state.profile = null;
    const view = renderHook(useSessionTracking);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(state.invoke).not.toHaveBeenCalled();
    state.profile = { id: 'profile-alice', user_id: 'alice' }; state.gate = true; view.rerender();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); }); expect(state.invoke).not.toHaveBeenCalled();
    state.gate = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); expect(state.invoke).toHaveBeenCalledOnce();
  });
  it('replaces the persisted old session ID with the checked current generation before reading revoke state', async () => {
    localStorage.setItem('vybe-app-session-id-alice-device-one', 'old-revoked');
    renderHook(useSessionTracking);
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    expect(state.ids).toEqual(['fresh-device-generation']); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('keeps credentials on registration/read outages and never trusts an unchecked response', async () => {
    state.invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    state.read.mockResolvedValue({ data: null, error: new Error('offline') }); localStorage.setItem('vybe-app-session-id-alice-device-one', 'old-device');
    renderHook(useSessionTracking); await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    expect(state.signOut).not.toHaveBeenCalled(); expect(localStorage.getItem('vybe-app-session-id-alice-device-one')).toBe('old-device');
  });
  it('requires interactive confirmation after an interrupted first-factor startup when the server denies resume', async () => {
    state.invoke.mockResolvedValue({ data: null, error: pendingError() });
    renderHook(useSessionTracking); await waitFor(() => expect(state.signOut).toHaveBeenCalledOnce());
    expect(state.read).not.toHaveBeenCalled();
  });
  it('never applies a pending confirmation denial to a replaced or unmounted account', async () => {
    const work = deferred<{ data: null; error: ReturnType<typeof pendingError> }>(); state.invoke.mockReturnValue(work.promise);
    const view = renderHook(useSessionTracking); await waitFor(() => expect(state.invoke).toHaveBeenCalledOnce());
    view.unmount(); state.epoch += 2;
    await act(async () => work.resolve({ data: null, error: pendingError() }));
    expect(state.signOut).not.toHaveBeenCalled();
  });
});
