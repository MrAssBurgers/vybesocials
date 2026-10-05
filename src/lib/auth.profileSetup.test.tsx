import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  account: { uid: undefined as string | undefined, epoch: 0 },
  subscribers: new Set<() => void>(),
  listener: null as null | ((event: string, session: unknown) => Promise<void>),
  ensure: vi.fn(), recover: vi.fn(), signup: vi.fn(), cache: vi.fn(), currentCache: vi.fn(), warm: vi.fn(),
  getSession: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock('@/lib/firebase', () => ({ db: {
  auth: {
    onAuthStateChange: (listener: typeof state.listener) => { state.listener = listener; return { data: { subscription: { unsubscribe: state.unsubscribe } } }; },
    getSession: state.getSession, signUp: state.signup, signOut: vi.fn(),
  },
  realtime: { setAuth: vi.fn() }, removeChannel: vi.fn(),
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }),
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
vi.mock('@/lib/firebaseAuthRefresh', () => ({ refreshFirebaseSession: vi.fn() }));
vi.mock('@/lib/functionAuth', () => ({ clearFunctionAuthHeadersCache: vi.fn() }));
vi.mock('@/lib/debugLogger', () => ({ logEvent: vi.fn() }));
vi.mock('@/lib/usernameAvailability', () => ({ checkUsernameAvailable: async () => ({ available: true, error: null }) }));
vi.mock('@/lib/analytics', () => ({ startHeartbeat: vi.fn(), stopHeartbeat: vi.fn() }));
vi.mock('@/lib/realtimeChannel', () => ({ removeRealtimeChannel: vi.fn(), subscribePostgresChannel: vi.fn() }));
vi.mock('@/lib/profileAvatarCache', () => ({ cacheProfileAvatar: vi.fn(), resolveProfileAvatarUrl: (_id: string, url: string | null) => url }));
vi.mock('@/lib/passwordRecoveryUrl', () => ({ isPasswordRecoveryUrl: () => false, redirectToPasswordRecoveryPage: vi.fn() }));
vi.mock('@/lib/firebase/oauthRedirect', () => ({ awaitOAuthRedirectCapture: async () => ({ session: null, error: null }), clearOAuthRedirectPending: vi.fn(), isLikelyFirebaseOAuthReturnUrl: () => false, isOAuthRedirectInFlight: () => false, recoverOAuthSessionIfSignedIn: vi.fn() }));
vi.mock('@/lib/despiaOAuth', () => ({ isDespiaOAuthInFlight: () => false }));
vi.mock('@/lib/loginApprovalGate', () => ({ beginLoginApprovalCheck: vi.fn(), endLoginApprovalCheck: vi.fn() }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: { uid: state.account.uid } }) }));
vi.mock('@/lib/authSessionMirror', () => ({ clearMirroredAuth: vi.fn() }));
vi.mock('@/lib/sentry', () => ({ setSentryUser: vi.fn() }));
vi.mock('@/components/auth/BannedScreen', () => ({ BannedScreen: () => null }));
vi.mock('@/components/auth/MemeBanScreen', () => ({ MemeBanScreen: () => null }));

import { AuthProvider, useAuth } from './auth';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';

let current: ReturnType<typeof useAuth>;
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
  return render(strict ? <StrictMode>{provider}</StrictMode> : provider);
}
async function switchAccount(uid: string, event = 'SIGNED_IN') {
  await act(async () => {
    state.account = { uid, epoch: state.account.epoch + 1 };
    state.subscribers.forEach(notify => notify());
    await state.listener?.(event, session(uid));
  });
}

beforeEach(() => {
  vi.clearAllMocks(); state.ensure.mockReset(); state.recover.mockReset(); state.signup.mockReset();
  state.account = { uid: undefined, epoch: 0 }; state.listener = null; state.subscribers.clear();
  state.getSession.mockImplementation(() => new Promise(() => {}));
  localStorage.clear(); sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('AuthProvider checked profile setup', () => {
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

  it('returns null on a transient refresh failure while retaining only the same-session confirmed profile', async () => {
    state.ensure.mockResolvedValueOnce(profile('alice', 'confirmed-alice')).mockRejectedValueOnce({ name: 'unavailable', message: 'offline' });
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
