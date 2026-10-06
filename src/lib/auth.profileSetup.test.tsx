import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  account: { uid: undefined as string | undefined, epoch: 0 },
  subscribers: new Set<() => void>(),
  listener: null as null | ((event: string, session: unknown) => Promise<void>),
  ensure: vi.fn(), recover: vi.fn(), signup: vi.fn(), cache: vi.fn(), currentCache: vi.fn(), warm: vi.fn(),
  getSession: vi.fn(), unsubscribe: vi.fn(), refresh: vi.fn(), signOut: vi.fn(),
  restoreState: 'ready' as 'pending' | 'ready' | 'error', restoreSubscribers: new Set<() => void>(), firebaseUser: null as null | { uid: string },
  bans: [] as Array<{ reason: string; is_permanent: boolean; is_meme_ban: boolean }>, banLoad: null as null | Promise<void>,
  confirmation: vi.fn(), notify: vi.fn(), password: vi.fn(), gate: false,
}));
vi.mock('@/lib/firebase', () => ({ db: {
  auth: {
    onAuthStateChange: (listener: typeof state.listener) => { state.listener = listener; return { data: { subscription: { unsubscribe: state.unsubscribe } } }; },
    getSession: state.getSession, signUp: state.signup, signOut: state.signOut, signInWithPassword: state.password, refreshSession: vi.fn(async () => ({})),
  },
  realtime: { setAuth: vi.fn() }, removeChannel: vi.fn(),
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: state.bans, error: null }) }) }) }) }),
} }));
vi.mock('@/lib/firebase/users', () => ({ ensureUserProfile: state.ensure, updateUserProfile: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => state.account,
  reportAccountSubscribe: (callback: () => void) => { state.subscribers.add(callback); return () => state.subscribers.delete(callback); },
}));
vi.mock('@/lib/tokenMarketplaceService', () => ({
  // Independent identity observers need not have seen the same event count.
  // Matching this to the report epoch hides the real cold-start loading bug.
  tokenAccountSnapshot: () => ({ ...state.account, epoch: state.account.epoch + 100 }),
  tokenAccountGuard: (uid = state.account.uid) => {
    const epoch = state.account.epoch;
    return () => { if (!uid || state.account.uid !== uid || state.account.epoch !== epoch) throw Object.assign(new Error('Retired account'), { code: 'account-changed' }); };
  },
}));
vi.mock('@/lib/accountProfileService', () => ({
  provisionAccountProfile: state.recover,
  profileSetupFailure: (error: { details?: { recoveryAvailable?: boolean } }) => ({ message: 'Profile setup needs retry', recoveryAvailable: error.details?.recoveryAvailable === true }),
}));
vi.mock('@/lib/profileCache', () => ({
  setCachedProfile: state.cache, setCachedCurrentProfile: state.currentCache, clearCachedCurrentProfile: vi.fn(), clearProfileCache: vi.fn(), setActiveAuthUserId: vi.fn(), stripStaleOnboardingFlagFromDisk: vi.fn(),
}));
vi.mock('@/lib/userLevelCache', () => ({ clearCachedUserLevel: vi.fn() }));
vi.mock('@/lib/loadDMConversations', () => ({ prefetchDMConversationsFromNav: vi.fn() }));
vi.mock('@/lib/warmHomeCaches', () => ({ warmHomeCachesForProfile: state.warm }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ resetSessionProfileMemo: vi.fn() }));
vi.mock('@/lib/themeReset', () => ({ resetThemeToDefault: vi.fn() }));
vi.mock('@/lib/legacyAuthStorage', () => ({ hasStoredAuthSession: () => false, getStoredAuthUserId: () => state.account.uid, clearObsoleteAuthStorage: vi.fn() }));
vi.mock('@/lib/wasLoggedIn', () => ({ setWasLoggedIn: vi.fn() }));
vi.mock('@/lib/authRedirect', () => ({ getAuthRedirectUrl: () => 'https://example.test/auth/callback' }));
vi.mock('@/lib/despiaBridge', () => ({ isDespiaRuntime: () => false }));
vi.mock('@/lib/firebaseAuthRefresh', () => ({ refreshFirebaseSession: state.refresh }));
vi.mock('@/lib/functionAuth', () => ({ clearFunctionAuthHeadersCache: vi.fn() }));
vi.mock('@/lib/debugLogger', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/usernameAvailability', () => ({ checkUsernameAvailable: async () => ({ available: true, error: null }) }));
vi.mock('@/lib/analytics', () => ({ startHeartbeat: vi.fn(), stopHeartbeat: vi.fn() }));
vi.mock('@/lib/realtimeChannel', () => ({ removeRealtimeChannel: vi.fn(), subscribePostgresChannel: vi.fn() }));
vi.mock('@/lib/profileAvatarCache', () => ({ cacheProfileAvatar: vi.fn(), resolveProfileAvatarUrl: (_id: string, url: string | null) => url }));
vi.mock('@/lib/passwordRecoveryUrl', () => ({ isPasswordRecoveryUrl: () => false, redirectToPasswordRecoveryPage: vi.fn() }));
vi.mock('@/lib/firebase/oauthRedirect', () => ({ awaitOAuthRedirectCapture: async () => ({ session: null, error: null }), clearOAuthRedirectPending: vi.fn(), isLikelyFirebaseOAuthReturnUrl: () => false, isOAuthRedirectInFlight: () => false, recoverOAuthSessionIfSignedIn: vi.fn() }));
vi.mock('@/lib/despiaOAuth', () => ({ isDespiaOAuthInFlight: () => false }));
vi.mock('@/lib/loginApprovalGate', () => ({ beginLoginApprovalCheck: () => { state.gate = true; }, endLoginApprovalCheck: () => { state.gate = false; }, shouldBlockPostLoginNavigation: () => state.gate }));
vi.mock('@/lib/emailConfirmation', async original => ({ ...await original<typeof import('@/lib/emailConfirmation')>(), beginEmailConfirmation: state.confirmation }));
vi.mock('@/hooks/useSessionTracking', () => ({ notifyFreshLogin: state.notify }));
vi.mock('@/lib/firebase/authService', () => ({
  getFirebaseAuth: () => { if (state.firebaseUser?.uid !== state.account.uid) state.firebaseUser = state.account.uid ? { uid: state.account.uid } : null; return { currentUser: state.firebaseUser }; },
  getAuthRestoreState: () => state.restoreState,
  subscribeAuthRestoreState: (callback: () => void) => { state.restoreSubscribers.add(callback); return () => state.restoreSubscribers.delete(callback); },
}));
vi.mock('@/lib/authSessionMirror', () => ({ clearMirroredAuth: vi.fn() }));
vi.mock('@/lib/sentry', () => ({ setSentryUser: vi.fn() }));
vi.mock('@/components/auth/BannedScreen', async () => { await state.banLoad; return { BannedScreen: BanProbe }; });
vi.mock('@/components/auth/MemeBanScreen', async () => { await state.banLoad; return { MemeBanScreen: BanProbe }; });

import { AuthProvider, useAuth } from './auth';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';
import { installNativeLifecycleEvents } from './nativeLifecycleEvents';
let stopNativeEvents: () => void;

let current: ReturnType<typeof useAuth>;
function BanProbe({ reason }: { reason?: string }) { const auth = useAuth(); return <p role="alert">{auth.user?.id}: {reason}</p>; }
function Probe() {
  current = useAuth();
  return <output data-testid="auth">{JSON.stringify({ uid: current.user?.id ?? null, profile: current.profile?.username ?? null, profileId: current.profile?.id ?? null, error: current.profileSetupError, pending: current.profileSetupLoading })}</output>;
}
const profile = (uid: string, username: string, id = `profile-${uid}`) => ({ id, user_id: uid, username, avatar_url: null, bio: '', created_at: '', onboarding_completed: true });
const session = (uid: string) => ({ user: { id: uid, email: `${uid}@example.test`, user_metadata: {} }, access_token: '', refresh_token: '' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const provider = <QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>;
  return { ...render(strict ? <StrictMode>{provider}</StrictMode> : provider), client };
}
async function switchAccount(uid: string, event = 'SIGNED_IN') {
  await act(async () => {
    state.account = { uid, epoch: state.account.epoch + 1 };
    state.subscribers.forEach(notify => notify());
    await state.listener?.(event, session(uid));
  });
}

beforeEach(() => {
  stopNativeEvents = installNativeLifecycleEvents();
  vi.clearAllMocks(); state.ensure.mockReset(); state.recover.mockReset(); state.signup.mockReset();
  state.account = { uid: undefined, epoch: 0 }; state.listener = null; state.subscribers.clear(); state.restoreSubscribers.clear(); state.restoreState = 'ready'; state.firebaseUser = null; state.refresh.mockReset(); state.signOut.mockReset();
  state.getSession.mockImplementation(() => new Promise(() => {}));
  state.bans = []; state.banLoad = null;
  state.gate = false; state.confirmation.mockReset(); state.notify.mockReset(); state.password.mockReset(); state.confirmation.mockResolvedValue(null);
  localStorage.clear(); sessionStorage.clear();
});
afterEach(() => { cleanup(); stopNativeEvents(); vi.useRealTimers(); delete (window as any).__REACT_QUERY_CLIENT__; document.body.style.backgroundImage = ''; });

describe('AuthProvider checked profile setup', () => {
  it('finishes the first checked bootstrap without restarting it for a duplicate sign-in event', async () => {
    const first = deferred<ReturnType<typeof profile>>();
    state.ensure.mockReturnValueOnce(first.promise).mockImplementation(() => new Promise(() => {}));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(state.ensure).toHaveBeenCalledOnce());
    await act(async () => { await state.listener?.('SIGNED_IN', session('alice')); });
    await act(async () => first.resolve(profile('alice', 'confirmed-alice')));
    expect(current.profile?.username).toBe('confirmed-alice');
    expect(state.ensure).toHaveBeenCalledOnce();
  });
  it('keeps the confirmed same-session profile on a duplicate sign-in event without another bootstrap', async () => {
    state.ensure.mockResolvedValueOnce(profile('alice', 'confirmed-alice')).mockImplementation(() => new Promise(() => {}));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profile?.username).toBe('confirmed-alice'));
    await act(async () => { await state.listener?.('SIGNED_IN', session('alice')); });
    expect(current.profileSetupLoading).toBe(false);
    expect(state.ensure).toHaveBeenCalledOnce();
  });
  it('checks an existing account binding before device registration without exposing the profile', async () => {
    const binding = deferred<ReturnType<typeof profile>>(); state.ensure.mockReturnValue(binding.promise); state.notify.mockResolvedValue({ requiresApproval: false });
    mount(); act(() => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); });
    let login!: ReturnType<typeof current.applyOAuthSession>;
    act(() => { login = current.applyOAuthSession(session('alice'), 'password'); });
    await waitFor(() => expect(state.ensure).toHaveBeenCalledOnce());
    expect(state.notify).not.toHaveBeenCalled(); expect(current.user).toBeNull(); expect(current.profile).toBeNull();
    await act(async () => { binding.resolve(profile('alice', 'migrated', 'legacy-profile')); await login; });
    expect(current.profile?.id).toBe('legacy-profile'); expect(state.ensure).toHaveBeenCalledOnce(); expect(state.notify).toHaveBeenCalledOnce();
  });

  it('surfaces an ownership-review failure without invoking device registration or caching an invented profile', async () => {
    state.ensure.mockRejectedValue({ details: { reason: 'profile-recovery-required', recoveryAvailable: false } });
    state.signOut.mockImplementation(async ({ guard }) => { guard(); state.account = { uid: undefined, epoch: 2 }; state.subscribers.forEach(notify => notify()); return { error: null }; });
    mount(); act(() => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); });
    await act(async () => { await expect(current.applyOAuthSession(session('alice'), 'email_2fa', { emailChallengeId: 'email-challenge' })).rejects.toThrow('ownership review'); });
    expect(state.notify).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled(); expect(current.user).toBeNull();
  });

  it('does not hydrate an email completion after its modal view retires during registration', async () => {
    const pending = deferred<{ requiresApproval: false }>(); state.notify.mockReturnValue(pending.promise); state.ensure.mockResolvedValue(profile('alice', 'alice')); let viewCurrent = true;
    mount(); act(() => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); });
    let completion!: ReturnType<typeof current.applyOAuthSession>;
    act(() => { completion = current.applyOAuthSession(session('alice'), 'email_2fa', { emailChallengeId: 'email-challenge', guard: () => { if (!viewCurrent) throw Error('View retired'); } }); });
    const rejected = expect(completion).rejects.toThrow('View retired');
    await waitFor(() => expect(state.notify).toHaveBeenCalledOnce()); viewCurrent = false;
    await act(async () => { pending.resolve({ requiresApproval: false }); await rejected; });
    expect(current.user).toBeNull(); expect(state.cache).not.toHaveBeenCalled(); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('waits for checked email-device completion before hydration and does not repeat the email challenge', async () => {
    const pending = deferred<{ requiresApproval: false }>(); state.notify.mockReturnValue(pending.promise);
    state.ensure.mockResolvedValue(profile('alice', 'alice')); mount();
    act(() => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); });
    let completion!: ReturnType<typeof current.applyOAuthSession>;
    act(() => { completion = current.applyOAuthSession(session('alice'), 'email_2fa', { emailChallengeId: 'email-challenge' }); });
    await waitFor(() => expect(state.notify).toHaveBeenCalledWith('email_2fa', expect.any(Function), 'email-challenge', true));
    await act(async () => { await state.listener?.('SIGNED_IN', session('alice')); });
    expect(current.user).toBeNull(); expect(current.profile).toBeNull(); expect(state.ensure).toHaveBeenCalledOnce(); expect(state.cache).not.toHaveBeenCalled(); expect(state.confirmation).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ requiresApproval: false }); await completion; });
    await waitFor(() => expect(current.profile?.user_id).toBe('alice'));
    expect(state.signOut).not.toHaveBeenCalled(); expect(state.notify).toHaveBeenCalledOnce(); expect(state.gate).toBe(false);
    expect(state.ensure).toHaveBeenCalledOnce();
  });

  it('keeps failed email-device completion signed out with no premature profile setup', async () => {
    state.notify.mockRejectedValue(Error('This device sign-in was not confirmed'));
    state.ensure.mockResolvedValue(profile('alice', 'alice'));
    state.signOut.mockImplementation(async ({ guard }) => { guard(); state.account = { uid: undefined, epoch: 2 }; state.subscribers.forEach(notify => notify()); return { error: null }; });
    mount(); act(() => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); });
    await act(async () => { await expect(current.applyOAuthSession(session('alice'), 'email_2fa', { emailChallengeId: 'email-challenge' })).rejects.toThrow('not confirmed'); });
    expect(state.signOut).toHaveBeenCalledOnce(); expect(state.ensure).toHaveBeenCalledOnce(); expect(state.cache).not.toHaveBeenCalled(); expect(current.user).toBeNull(); expect(state.gate).toBe(false);
  });

  it('does not let delayed email confirmation hydrate or sign out a replacement account', async () => {
    const pending = deferred<{ requiresApproval: false }>(); state.notify.mockReturnValue(pending.promise); state.ensure.mockImplementation(async uid => profile(uid, uid));
    mount(); act(() => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); });
    let completion!: ReturnType<typeof current.applyOAuthSession>;
    act(() => { completion = current.applyOAuthSession(session('alice'), 'email_2fa', { emailChallengeId: 'email-challenge' }); });
    const rejected = expect(completion).rejects.toMatchObject({ code: 'auth-attempt-retired' });
    await waitFor(() => expect(state.notify).toHaveBeenCalledOnce());
    state.gate = false; await switchAccount('bob'); await waitFor(() => expect(current.user?.id).toBe('bob'));
    await act(async () => { pending.resolve({ requiresApproval: false }); await rejected; });
    expect(current.user?.id).toBe('bob'); expect(state.signOut).not.toHaveBeenCalled();
  });
  it.each([false, true])('blocks children while the lazy ban screen loads and preserves its Auth context (meme=%s)', async meme => {
    const moduleReady = deferred<void>(); state.banLoad = moduleReady.promise;
    state.bans = [{ reason: 'Account access is restricted', is_permanent: true, is_meme_ban: meme }];
    state.ensure.mockResolvedValue(profile('alice', 'alice'));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await screen.findByRole('status', { name: 'Loading account notice' });
    expect(screen.queryByTestId('auth')).not.toBeInTheDocument();
    await act(async () => moduleReady.resolve());
    expect(await screen.findByRole('alert')).toHaveTextContent('alice: Account access is restricted');
    expect(screen.queryByTestId('auth')).not.toBeInTheDocument();
  });

  it('does not let delayed logout cleanup erase a replacement login or its caches', async () => {
    const pending = deferred<{ error: null }>();
    state.ensure.mockImplementation(async (uid: string) => profile(uid, `current-${uid}`));
    state.signOut.mockImplementation(({ guard }) => { guard(); return pending.promise; });
    const view = mount(); (window as any).__REACT_QUERY_CLIENT__ = view.client;
    await switchAccount('alice', 'INITIAL_SESSION'); await waitFor(() => expect(current.profile?.user_id).toBe('alice'));
    let logout!: Promise<void>; act(() => { logout = current.signOut(); });
    await switchAccount('bob'); await waitFor(() => expect(current.profile?.user_id).toBe('bob'));
    view.client.setQueryData(['replacement-account'], 'bob-cache');
    localStorage.setItem('firebase:authUser:replacement:[DEFAULT]', 'bob-credentials');
    localStorage.setItem('vybe-font-body', 'bob-font');
    document.body.style.backgroundImage = 'url("https://example.test/bob.png")';
    await act(async () => { pending.resolve({ error: null }); await logout; });
    expect(state.signOut).toHaveBeenCalledOnce();
    expect(current.user?.id).toBe('bob'); expect(current.profile?.user_id).toBe('bob');
    expect(view.client.getQueryData(['replacement-account'])).toBe('bob-cache');
    expect(localStorage.getItem('firebase:authUser:replacement:[DEFAULT]')).toBe('bob-credentials');
    expect(localStorage.getItem('vybe-font-body')).toBe('bob-font');
    expect(document.body.style.backgroundImage).toContain('bob.png');
  });

  it('cleans only the confirmed signed-out state and invokes the adapter once', async () => {
    state.ensure.mockResolvedValue(profile('alice', 'alice'));
    state.signOut.mockImplementation(async ({ guard }) => {
      guard(); state.account = { uid: undefined, epoch: state.account.epoch + 1 };
      state.subscribers.forEach(notify => notify());
      await state.listener?.('SIGNED_OUT', null);
      return { error: null };
    });
    const view = mount(); (window as any).__REACT_QUERY_CLIENT__ = view.client;
    await switchAccount('alice', 'INITIAL_SESSION'); await waitFor(() => expect(current.profile?.user_id).toBe('alice'));
    view.client.setQueryData(['old-account'], 'alice-cache'); localStorage.setItem('vybe-font-body', 'alice-font');
    await act(async () => current.signOut());
    expect(state.signOut).toHaveBeenCalledOnce(); expect(current.user).toBeNull();
    expect(view.client.getQueryData(['old-account'])).toBeUndefined(); expect(localStorage.getItem('vybe-font-body')).toBeNull();
  });

  it('finishes StrictMode restoration with independently numbered token and profile observer epochs', async () => {
    state.account = { uid: 'alice', epoch: 1 };
    state.getSession.mockResolvedValue({ data: { session: session('alice') }, error: null });
    const pending = deferred<ReturnType<typeof profile>>(); state.ensure.mockReturnValue(pending.promise);
    mount(true);
    expect(tokenAccountSnapshot().epoch).not.toBe(reportAccountSnapshot().epoch);
    await waitFor(() => expect(state.unsubscribe).toHaveBeenCalledOnce());
    await waitFor(() => expect(state.ensure).toHaveBeenCalledOnce());
    expect(current.profile).toBeNull(); expect(current.profileSetupLoading).toBe(true);
    await act(async () => pending.resolve(profile('alice', 'strict-restored-alice')));
    expect(current.profile?.username).toBe('strict-restored-alice'); expect(current.profileSetupLoading).toBe(false);
    expect(current.profileSetupError).toBeNull();
    expect(state.currentCache).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ username: 'strict-restored-alice' }));
  });

  it('rejects delayed A → B → A responses, including their profile-cache writes', async () => {
    const oldA = deferred<ReturnType<typeof profile>>(), oldB = deferred<ReturnType<typeof profile>>(), newA = deferred<ReturnType<typeof profile>>();
    state.ensure.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(oldB.promise).mockReturnValueOnce(newA.promise);
    mount();
    await switchAccount('alice', 'INITIAL_SESSION'); await waitFor(() => expect(state.ensure).toHaveBeenCalledTimes(1));
    await switchAccount('bob'); await waitFor(() => expect(state.ensure).toHaveBeenCalledTimes(2));
    await switchAccount('alice'); await waitFor(() => expect(state.ensure).toHaveBeenCalledTimes(3));
    await act(async () => { oldA.resolve(profile('alice', 'retired-alice')); oldB.resolve(profile('bob', 'retired-bob')); });
    expect(current.profile).toBeNull(); expect(current.profileSetupLoading).toBe(true);
    expect(state.cache).not.toHaveBeenCalled(); expect(state.currentCache).not.toHaveBeenCalled();
    await act(async () => newA.resolve(profile('alice', 'current-alice')));
    expect(screen.getByTestId('auth')).toHaveTextContent('current-alice');
    expect(state.currentCache).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ user_id: 'alice', username: 'current-alice' }));
  });

  it('does not cache or warm a setup response after its provider unmounts', async () => {
    const pending = deferred<ReturnType<typeof profile>>(); state.ensure.mockReturnValue(pending.promise);
    const view = mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(state.ensure).toHaveBeenCalledOnce()); view.unmount();
    await act(async () => pending.resolve(profile('alice', 'late-alice')));
    expect(state.unsubscribe).toHaveBeenCalledOnce(); expect(state.cache).not.toHaveBeenCalled();
    expect(state.currentCache).not.toHaveBeenCalled(); expect(state.warm).not.toHaveBeenCalled();
  });

  it('keeps a failed bootstrap signed in, ignores disk identity, and allows a checked retry', async () => {
    localStorage.setItem('vybe-current-profile-v1', JSON.stringify(profile('alice', 'unconfirmed-disk-profile')));
    state.ensure.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValueOnce(profile('alice', 'confirmed-alice'));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profileSetupError).not.toBeNull());
    expect(current.user?.id).toBe('alice'); expect(current.profile).toBeNull(); expect(current.profileSetupLoading).toBe(false);
    expect(screen.getByTestId('auth')).not.toHaveTextContent('unconfirmed-disk-profile'); expect(state.currentCache).not.toHaveBeenCalled();
    await act(async () => current.retryProfileSetup());
    expect(current.profile?.username).toBe('confirmed-alice'); expect(current.profileSetupError).toBeNull();
    expect(state.signup).not.toHaveBeenCalled();
  });

  it('ends a hung setup with an actionable failure and rejects its late success', async () => {
    vi.useFakeTimers();
    const pending = deferred<ReturnType<typeof profile>>(); state.ensure.mockReturnValue(pending.promise);
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await vi.waitFor(() => expect(state.ensure).toHaveBeenCalledOnce());
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(current.user?.id).toBe('alice'); expect(current.profile).toBeNull();
    expect(current.profileSetupLoading).toBe(false); expect(current.profileSetupError).not.toBeNull();
    await act(async () => pending.resolve(profile('alice', 'too-late')));
    expect(current.profile).toBeNull(); expect(current.profileSetupError).not.toBeNull();
    expect(state.currentCache).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'unavailable', message: 'offline' },
    { code: 'functions/unavailable', message: 'offline' },
    { code: 'auth/network-request-failed', message: 'offline' },
    { code: 'functions/deadline-exceeded', message: 'offline' },
  ])('retains only the same-session confirmed profile on transient refresh failure %#', async error => {
    state.ensure.mockResolvedValueOnce(profile('alice', 'confirmed-alice')).mockRejectedValueOnce(error);
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profile?.username).toBe('confirmed-alice'));
    let result: unknown;
    await act(async () => { result = await current.refreshProfile(); });
    expect(result).toBeNull(); expect(current.profile?.username).toBe('confirmed-alice'); expect(current.profileSetupError).toBeNull();
    expect(current.user?.id).toBe('alice'); expect(current.profileSetupLoading).toBe(false);
    expect(state.currentCache).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'failed-precondition', details: { reason: 'profile-recovery-required', recoveryAvailable: true } },
    { name: 'permission-denied' },
    { name: 'unauthenticated' },
    new Error('Profile setup returned an invalid confirmation'),
  ])('clears the previously confirmed profile after authoritative refresh rejection %#', async error => {
    state.ensure.mockResolvedValueOnce(profile('alice', 'confirmed-alice')).mockRejectedValueOnce(error);
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profile?.username).toBe('confirmed-alice'));
    let result: unknown;
    await act(async () => { result = await current.refreshProfile(); });
    expect(result).toBeNull(); expect(current.profile).toBeNull(); expect(current.profileSetupError).not.toBeNull();
    expect(current.user?.id).toBe('alice'); expect(current.profileSetupLoading).toBe(false);
    expect(state.currentCache).toHaveBeenCalledTimes(1);
  });

  it('does not let a replaced same-account refresh overwrite the latest confirmed profile', async () => {
    const first = deferred<ReturnType<typeof profile>>(), second = deferred<ReturnType<typeof profile>>();
    state.ensure.mockResolvedValueOnce(profile('alice', 'initial')).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mount(); await switchAccount('alice', 'INITIAL_SESSION'); await waitFor(() => expect(current.profile?.username).toBe('initial'));
    let pendingFirst!: Promise<unknown>, pendingSecond!: Promise<unknown>;
    act(() => { pendingFirst = current.refreshProfile(); }); await waitFor(() => expect(state.ensure).toHaveBeenCalledTimes(2));
    act(() => { pendingSecond = current.refreshProfile(); }); await waitFor(() => expect(state.ensure).toHaveBeenCalledTimes(3));
    await act(async () => { second.resolve(profile('alice', 'latest')); await pendingSecond; });
    await act(async () => { first.resolve(profile('alice', 'outdated')); await pendingFirst; });
    expect(current.profile?.username).toBe('latest'); expect(current.profileSetupError).toBeNull();
    expect(state.currentCache).toHaveBeenCalledTimes(2);
    expect(state.currentCache).toHaveBeenLastCalledWith(expect.objectContaining({ username: 'latest' }));
  });

  it('reports successful Auth signup with a visible profile error when profile creation fails', async () => {
    state.ensure.mockRejectedValue(new Error('bootstrap unavailable'));
    state.signup.mockImplementation(async () => {
      await switchAccount('new-alice');
      return { data: { session: session('new-alice'), user: session('new-alice').user, verificationEmailSent: true }, error: null };
    });
    mount();
    let result: Awaited<ReturnType<typeof current.signUp>> | undefined;
    await act(async () => { result = await current.signUp('new-alice@example.test', 'test-only-password', 'new_alice'); });
    expect(result).toMatchObject({ error: null, needsEmailConfirmation: false, verificationEmailSent: true });
    expect(current.user?.id).toBe('new-alice'); expect(current.profile).toBeNull(); expect(current.profileSetupError).not.toBeNull();
    expect(current.profileSetupLoading).toBe(false); expect(state.signup).toHaveBeenCalledOnce();
    expect(state.currentCache).not.toHaveBeenCalled();
  });

  it('uses explicit approved recovery to restore the stable migrated profile ID', async () => {
    state.ensure.mockRejectedValue({ details: { reason: 'profile-recovery-required', recoveryAvailable: true } });
    state.recover.mockResolvedValue({ profile: profile('alice', 'recovered-alice', 'legacy-profile') });
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profileSetupError?.recoveryAvailable).toBe(true));
    expect(state.recover).not.toHaveBeenCalled();
    await act(async () => current.recoverProfileSetup());
    expect(state.recover).toHaveBeenCalledWith('alice', { action: 'recover' }, expect.any(Function));
    expect(current.profile?.id).toBe('legacy-profile'); expect(current.profileSetupError).toBeNull();
  });
});

describe('AuthProvider restoration and refresh ownership', () => {
  it('recovers a temporary startup token failure without waiting for a new browser event', async () => {
    vi.useFakeTimers();
    state.ensure.mockRejectedValueOnce({ code: 'auth/network-request-failed' }).mockResolvedValueOnce(profile('alice', 'recovered'));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    expect(current.profile).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(current.profile?.username).toBe('recovered');
    expect(state.ensure).toHaveBeenCalledTimes(2); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('bounds automatic startup retries when the network remains unavailable', async () => {
    vi.useFakeTimers(); state.ensure.mockRejectedValue({ code: 'auth/network-request-failed' });
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(state.ensure).toHaveBeenCalledTimes(3);
    expect(current.profileSetupError).not.toBeNull(); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('retires a pending startup retry across account changes and unmount', async () => {
    vi.useFakeTimers();
    state.ensure.mockRejectedValueOnce({ code: 'auth/network-request-failed' }).mockImplementation(async uid => profile(uid, uid));
    mount(); await switchAccount('alice', 'INITIAL_SESSION'); await switchAccount('bob');
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(state.ensure).toHaveBeenCalledTimes(2); expect(current.profile?.user_id).toBe('bob');
    cleanup(); await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(state.ensure).toHaveBeenCalledTimes(2);
  });
  it.each(['online', 'app-resumed', 'document-resumed'])('retries a transient profile failure on %s with an unexpired token', async event => {
    state.ensure.mockRejectedValueOnce({ code: 'functions/unavailable' }).mockResolvedValueOnce(profile('alice', 'recovered'));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profileSetupError).not.toBeNull());
    state.getSession.mockResolvedValue({ data: { session: { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null });
    await act(async () => { if (event === 'document-resumed') document.dispatchEvent(new CustomEvent('app-resumed')); else window.dispatchEvent(new Event(event)); });
    await waitFor(() => expect(current.profile?.username).toBe('recovered'));
    expect(state.ensure).toHaveBeenCalledTimes(2); expect(state.refresh).not.toHaveBeenCalled(); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('does not retry an authoritative profile rejection on reconnect', async () => {
    state.ensure.mockRejectedValue({ code: 'functions/permission-denied' });
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profileSetupError).not.toBeNull());
    state.getSession.mockResolvedValue({ data: { session: { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null });
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(state.ensure).toHaveBeenCalledOnce(); expect(current.profile).toBeNull();
  });
  it('a delayed reconnect read cannot retry a retired account after Alice→Bob→Alice', async () => {
    state.ensure.mockRejectedValueOnce({ code: 'functions/unavailable' }).mockImplementation(async uid => profile(uid, `current-${uid}`));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profileSetupError).not.toBeNull());
    const pending = deferred<any>(); state.getSession.mockReturnValue(pending.promise);
    act(() => window.dispatchEvent(new Event('online')));
    await switchAccount('bob'); await waitFor(() => expect(current.profile?.username).toBe('current-bob'));
    await switchAccount('alice'); await waitFor(() => expect(current.profile?.username).toBe('current-alice'));
    await act(async () => pending.resolve({ data: { session: { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 3600 } }, error: null }));
    expect(state.ensure).toHaveBeenCalledTimes(3); expect(current.profile?.username).toBe('current-alice'); expect(state.signOut).not.toHaveBeenCalled();
  });

  it.each(['functions/unavailable', 'auth/network-request-failed', 'functions/deadline-exceeded'])('retries failed initial profile setup after a current token event (%s)', async code => {
    state.ensure.mockRejectedValueOnce({ code, message: 'Temporary connection failure' }).mockResolvedValueOnce(profile('alice', 'recovered'));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profileSetupError).not.toBeNull());
    await act(async () => { await state.listener?.('TOKEN_REFRESHED', session('alice')); });
    await waitFor(() => expect(current.profile?.username).toBe('recovered'));
    expect(state.ensure).toHaveBeenCalledTimes(2); expect(current.user?.id).toBe('alice');
    expect(state.signOut).not.toHaveBeenCalled();
  });

  it.each(['functions/permission-denied', 'auth/profile-recovery-required'])('does not automatically retry authoritative setup rejection (%s)', async code => {
    state.ensure.mockRejectedValue({ code, message: 'Account review required' });
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profileSetupError).not.toBeNull());
    await act(async () => { await state.listener?.('TOKEN_REFRESHED', session('alice')); });
    expect(state.ensure).toHaveBeenCalledOnce(); expect(current.profile).toBeNull();
  });

  it('does not let a retired profile failure retry the replacement account', async () => {
    const late = deferred<ReturnType<typeof profile>>();
    state.ensure.mockReturnValueOnce(late.promise).mockResolvedValueOnce(profile('bob', 'bob'));
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(state.ensure).toHaveBeenCalledOnce());
    await switchAccount('bob'); await waitFor(() => expect(current.profile?.username).toBe('bob'));
    await act(async () => { late.reject({ code: 'functions/unavailable' }); });
    await act(async () => { await state.listener?.('TOKEN_REFRESHED', session('bob')); });
    expect(state.ensure).toHaveBeenCalledTimes(2); expect(current.profile?.username).toBe('bob');
  });

  it('keeps a confirmed profile after transient refresh failure and a token event', async () => {
    state.ensure.mockResolvedValueOnce(profile('alice', 'confirmed')).mockRejectedValueOnce({ code: 'functions/unavailable' });
    mount(); await switchAccount('alice', 'INITIAL_SESSION');
    await waitFor(() => expect(current.profile?.username).toBe('confirmed'));
    await act(async () => { await current.refreshProfile(); });
    await act(async () => { await state.listener?.('TOKEN_REFRESHED', session('alice')); });
    expect(state.ensure).toHaveBeenCalledTimes(2); expect(current.profile?.username).toBe('confirmed');
  });

  it('retries a temporary scheduled token failure without signing out the confirmed account', async () => {
    vi.useFakeTimers(); state.ensure.mockImplementation(async uid => profile(uid, uid)); mount();
    const expires = Math.floor(Date.now() / 1000) + 301;
    state.refresh.mockResolvedValueOnce({ data: { session: null }, error: { name: 'auth/network-request-failed', message: 'Network request failed' } })
      .mockResolvedValue({ data: { session: { ...session('alice'), expires_at: expires + 3600 } }, error: null });
    await act(async () => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); await state.listener?.('INITIAL_SESSION', { ...session('alice'), expires_at: expires }); await vi.advanceTimersByTimeAsync(1001); });
    expect(state.refresh).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(2001); });
    expect(state.refresh).toHaveBeenCalledTimes(2); expect(state.signOut).not.toHaveBeenCalled(); expect(current.user?.id).toBe('alice');
  });
  it.each(['app-resumed', 'online'])('refreshes a near-expiry SDK account on %s even without a disk hint', async event => {
    vi.useFakeTimers(); state.ensure.mockImplementation(async uid => profile(uid, uid)); mount(); await switchAccount('alice');
    const near = { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 60 };
    state.getSession.mockResolvedValue({ data: { session: near }, error: null });
    state.refresh.mockResolvedValue({ data: { session: { ...near, expires_at: near.expires_at + 3600 } }, error: null });
    await act(async () => { window.dispatchEvent(new Event(event)); await vi.advanceTimersByTimeAsync(1001); });
    expect(state.refresh).toHaveBeenCalledOnce(); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('retires a queued network retry when the account changes', async () => {
    vi.useFakeTimers(); state.ensure.mockImplementation(async uid => profile(uid, uid)); mount();
    state.refresh.mockResolvedValue({ data: { session: null }, error: { name: 'auth/network-request-failed', message: 'Network request failed' } });
    await act(async () => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); await state.listener?.('INITIAL_SESSION', { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 301 }); await vi.advanceTimersByTimeAsync(1001); });
    await switchAccount('bob'); await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
    expect(state.refresh).toHaveBeenCalledOnce(); expect(current.user?.id).toBe('bob'); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('does not send scheduled refresh requests while offline and recovers on network return', async () => {
    vi.useFakeTimers(); state.ensure.mockImplementation(async uid => profile(uid, uid)); mount();
    const network = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const near = { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 301 };
    state.getSession.mockResolvedValue({ data: { session: near }, error: null });
    state.refresh.mockResolvedValue({ data: { session: { ...near, expires_at: near.expires_at + 3600 } }, error: null });
    try {
      await act(async () => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); await state.listener?.('INITIAL_SESSION', near); await vi.advanceTimersByTimeAsync(31001); });
      expect(state.refresh).not.toHaveBeenCalled();
      network.mockReturnValue(true); await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(1001); });
      expect(state.refresh).toHaveBeenCalledOnce(); expect(state.signOut).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });
  it('bounds repeated temporary refresh retries instead of retrying every frame or signing out', async () => {
    vi.useFakeTimers(); state.ensure.mockImplementation(async uid => profile(uid, uid)); mount();
    state.refresh.mockResolvedValue({ data: { session: null }, error: { name: 'auth/network-request-failed', message: 'Network request failed' } });
    await act(async () => { state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify()); await state.listener?.('INITIAL_SESSION', { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 301 }); await vi.advanceTimersByTimeAsync(61001); });
    expect(state.refresh.mock.calls.length).toBeLessThanOrEqual(6); expect(state.refresh.mock.calls.length).toBeGreaterThan(1); expect(state.signOut).not.toHaveBeenCalled();
  });
  it('does not schedule a replacement-account refresh from a delayed foreground session read', async () => {
    vi.useFakeTimers(); state.ensure.mockImplementation(async uid => profile(uid, uid)); mount(); await switchAccount('alice');
    const pending = deferred<any>(); state.getSession.mockReturnValue(pending.promise);
    act(() => { window.dispatchEvent(new Event('app-resumed')); }); await switchAccount('bob');
    await act(async () => { pending.resolve({ data: { session: { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 60 } }, error: null }); await vi.advanceTimersByTimeAsync(1001); });
    expect(state.refresh).not.toHaveBeenCalled(); expect(current.user?.id).toBe('bob');
  });
  it('never declares signed out from the startup timeout while native restoration is pending', async () => {
    vi.useFakeTimers(); state.restoreState = 'pending'; mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(8_001); });
    expect(current.loading).toBe(false); expect(current.authReady).toBe(false); expect(current.user).toBeNull(); expect(state.signOut).not.toHaveBeenCalled();
    state.ensure.mockResolvedValue(profile('alice', 'restored-alice'));
    await act(async () => { state.restoreState = 'ready'; state.restoreSubscribers.forEach(notify => notify()); });
    await switchAccount('alice', 'INITIAL_SESSION');
    expect(current.authReady).toBe(true); expect(current.user?.id).toBe('alice');
  });
  it.each(['auth/restore-pending', 'auth/restore-unavailable'])('preserves unresolved account state after %s rather than creating an authoritative empty result', async name => {
    state.restoreState = name.endsWith('pending') ? 'pending' : 'error';
    state.getSession.mockResolvedValue({ data: { session: null }, error: { name, message: 'Restore not settled' } }); mount();
    await waitFor(() => expect(state.getSession).toHaveBeenCalled()); expect(current.authReady).toBe(false); expect(state.signOut).not.toHaveBeenCalled(); expect(state.cache).not.toHaveBeenCalled();
    await act(async () => { state.restoreState = 'ready'; state.restoreSubscribers.forEach(notify => notify()); await state.listener?.('INITIAL_SESSION', null); });
    expect(current.authReady).toBe(true); expect(current.user).toBeNull();
  });
  it('accepts a delayed real session result after the old synthetic-null deadline', async () => {
    vi.useFakeTimers(); const pending = deferred<{ data: { session: ReturnType<typeof session> }; error: null }>(); state.getSession.mockReturnValue(pending.promise);
    state.account = { uid: 'alice', epoch: 1 }; state.ensure.mockResolvedValue(profile('alice', 'late-real-session')); mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); }); expect(current.authReady).toBe(false);
    await act(async () => pending.resolve({ data: { session: session('alice') }, error: null }));
    expect(current.authReady).toBe(true); expect(current.user?.id).toBe('alice');
  });
  it('never lets a delayed old-account fatal refresh sign out the replacement account', async () => {
    vi.useFakeTimers(); const pending = deferred<unknown>(); state.refresh.mockReturnValue(pending.promise); state.ensure.mockImplementation(async uid => profile(uid, uid)); mount();
    await act(async () => {
      state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify());
      await state.listener?.('INITIAL_SESSION', { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 301 });
      await vi.advanceTimersByTimeAsync(1001);
    });
    expect(state.refresh).toHaveBeenCalledOnce(); await switchAccount('bob');
    await act(async () => pending.resolve({ data: { session: null }, error: { message: 'Invalid refresh token' } }));
    expect(state.signOut).not.toHaveBeenCalled(); expect(current.user?.id).toBe('bob');
  });
  it('passes the fatal-refresh guard through to a delayed SDK logout dispatch', async () => {
    vi.useFakeTimers(); const dispatch = deferred<void>(), commit = vi.fn();
    state.refresh.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid refresh token' } });
    state.signOut.mockImplementation(async ({ guard }) => {
      await dispatch.promise;
      try { guard(); commit(); return { error: null }; } catch (error) { return { error }; }
    });
    state.ensure.mockImplementation(async uid => profile(uid, uid)); mount();
    await act(async () => {
      state.account = { uid: 'alice', epoch: 1 }; state.subscribers.forEach(notify => notify());
      await state.listener?.('INITIAL_SESSION', { ...session('alice'), expires_at: Math.floor(Date.now() / 1000) + 301 });
      await vi.advanceTimersByTimeAsync(1001);
    });
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local', guard: expect.any(Function) });
    await switchAccount('bob'); await act(async () => dispatch.resolve());
    expect(commit).not.toHaveBeenCalled(); expect(current.user?.id).toBe('bob');
  });
});
