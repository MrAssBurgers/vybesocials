import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, user: null as any, invoke: vi.fn() }));
vi.mock('./reportModerationService', () => ({ reportAccountSnapshot: () => mock.session }));
vi.mock('./firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: mock.user }) }));
vi.mock('./firebase/functionsService', () => ({ invokeFunction: (...args: unknown[]) => mock.invoke(...args) }));
const createdAt = Date.parse('2026-01-01T00:00:00Z');
const profile = (uid = 'alice') => ({ id: `legacy-${uid}`, user_id: uid, username: uid, onboarding_completed: true });
function receipt(request: any) { return { data: { ok: true, ownerUid: request.expectedOwnerUid, accountCreatedAt: request.expectedAccountCreatedAt, requestId: request.requestId, action: request.action, status: 'ready', profileId: `legacy-${request.expectedOwnerUid}`, profile: profile(request.expectedOwnerUid), bindingRevision: 'a'.repeat(48), created: false, recovered: false }, error: null }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function switchTo(uid = 'alice') { mock.session = { uid, epoch: mock.session.epoch + 1 }; mock.user = { uid, metadata: { creationTime: new Date(createdAt).toUTCString() }, getIdToken: vi.fn().mockResolvedValue('test-token') }; }
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); sessionStorage.clear(); switchTo(); mock.invoke.mockImplementation(async (_name, request) => receipt(request)); });
afterEach(() => vi.useRealTimers());

describe('checked account profile setup', () => {
  it('preserves a token network failure without dispatching an anonymous profile request or discarding the session', async () => {
    const failure = Object.assign(new Error('Network unavailable'), { code: 'auth/network-request-failed' });
    mock.user.getIdToken.mockRejectedValueOnce(failure);
    const { provisionAccountProfile } = await import('./accountProfileService');
    const user = mock.user;
    await expect(provisionAccountProfile('alice')).rejects.toBe(failure);
    expect(mock.invoke).not.toHaveBeenCalled(); expect(mock.user).toBe(user);
    const request = JSON.parse(sessionStorage.getItem('vybe:profile-setup-attempts:v1')!)[0];
    await provisionAccountProfile('alice'); expect(mock.invoke.mock.calls[0][1]).toEqual(request);
  });
  it('bounds a stalled token and never dispatches its late result', async () => {
    vi.useFakeTimers(); const token = deferred<string>(); mock.user.getIdToken.mockReturnValueOnce(token.promise);
    const { provisionAccountProfile } = await import('./accountProfileService');
    const pending = provisionAccountProfile('alice');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'deadline-exceeded' });
    await vi.advanceTimersByTimeAsync(15_000); await rejected;
    token.resolve('late-token'); await vi.advanceTimersByTimeAsync(0);
    expect(mock.invoke).not.toHaveBeenCalled(); expect(mock.session.uid).toBe('alice');
  });
  it('waits for the restored account token before invoking profile authority', async () => {
    const token = deferred<string>(); mock.user.getIdToken.mockReturnValueOnce(token.promise);
    const { provisionAccountProfile } = await import('./accountProfileService');
    const pending = provisionAccountProfile('alice');
    expect(mock.invoke).not.toHaveBeenCalled(); token.resolve('test-token'); await pending;
    expect(mock.invoke).toHaveBeenCalledOnce();
  });
  it('retires a pending token after account ABA before any profile dispatch', async () => {
    const token = deferred<string>(); mock.user.getIdToken.mockReturnValueOnce(token.promise);
    const { provisionAccountProfile } = await import('./accountProfileService');
    const pending = provisionAccountProfile('alice');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'account-changed' });
    switchTo('bob'); switchTo('alice'); token.resolve('retired-token'); await rejected;
    expect(mock.invoke).not.toHaveBeenCalled();
  });

  it('binds the live Auth incarnation and accepts a preserved legacy profile ID', async () => {
    const { provisionAccountProfile } = await import('./accountProfileService');
    expect((await provisionAccountProfile('alice', { defaults: { username: 'alice', onboardingCompleted: false } })).profileId).toBe('legacy-alice');
    expect(mock.invoke).toHaveBeenCalledWith('ensureAccountProfile', expect.objectContaining({ expectedOwnerUid: 'alice', expectedAccountCreatedAt: createdAt, action: 'ensure', requestId: expect.stringMatching(/^[a-f0-9-]{36}$/), defaults: { username: 'alice', onboardingCompleted: false } }));
    expect(sessionStorage.getItem('vybe:profile-setup-attempts:v1')).toBe('[]');
  });
  it('retains the exact request and defaults after a lost reply, including reload', async () => {
    mock.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Lost reply' } });
    const first = await import('./accountProfileService');
    await expect(first.provisionAccountProfile('alice', { defaults: { username: 'alice' } })).rejects.toMatchObject({ name: 'unavailable' });
    const original = mock.invoke.mock.calls[0][1];
    vi.resetModules();
    const second = await import('./accountProfileService');
    await second.provisionAccountProfile('alice', { defaults: { username: 'different' } });
    expect(mock.invoke.mock.calls[1][1]).toEqual(original);
  });
  it.each(['not-found', 'unimplemented'])('keeps the signed-in account and exact retry after the profile service returns %s', async name => {
    const user = mock.user;
    mock.invoke.mockResolvedValueOnce({ data: null, error: { name, message: '<html>unavailable endpoint</html>' } });
    const first = await import('./accountProfileService');
    await expect(first.provisionAccountProfile('alice')).rejects.toMatchObject({ name });
    const request = mock.invoke.mock.calls[0][1];
    expect(mock.user).toBe(user); expect(mock.session.uid).toBe('alice');
    vi.resetModules(); const second = await import('./accountProfileService');
    expect((await second.provisionAccountProfile('alice')).profile.id).toBe('legacy-alice');
    expect(mock.invoke.mock.calls[1][1]).toEqual(request); expect(mock.user).toBe(user);
  });
  it.each(['already-exists', 'invalid-argument'])('allows a corrected setup after a confirmed %s rejection', async name => {
    mock.invoke.mockResolvedValueOnce({ data: null, error: { name, message: 'Rejected' } });
    const { provisionAccountProfile } = await import('./accountProfileService');
    await expect(provisionAccountProfile('alice', { defaults: { username: 'taken' } })).rejects.toMatchObject({ name });
    await provisionAccountProfile('alice', { defaults: { username: 'corrected' } });
    expect(mock.invoke.mock.calls[1][1].requestId).not.toBe(mock.invoke.mock.calls[0][1].requestId);
    expect(mock.invoke.mock.calls[1][1].defaults).toEqual({ username: 'corrected' });
  });
  it.each(['ownerUid', 'profileOwner', 'profileId', 'accountCreatedAt', 'requestId', 'bindingRevision'])('rejects an unbound %s receipt and preserves retry identity', async field => {
    mock.invoke.mockImplementation(async (_name, request) => { const result = receipt(request); if (field === 'profileOwner') result.data.profile.user_id = 'bob'; else if (field === 'accountCreatedAt') result.data.accountCreatedAt++; else (result.data as any)[field] = 'invalid'; return result; });
    const { provisionAccountProfile } = await import('./accountProfileService');
    await expect(provisionAccountProfile('alice')).rejects.toThrow('invalid confirmation');
    expect(JSON.parse(sessionStorage.getItem('vybe:profile-setup-attempts:v1')!)).toHaveLength(1);
  });
  it('rejects late replies after A→B→A and leaves the receipt available for current-account retry', async () => {
    const held = deferred<any>(); mock.invoke.mockReturnValueOnce(held.promise);
    const { provisionAccountProfile } = await import('./accountProfileService');
    const pending = provisionAccountProfile('alice'); await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledOnce()); const request = mock.invoke.mock.calls[0][1];
    switchTo('bob'); switchTo('alice'); held.resolve(receipt(request));
    await expect(pending).rejects.toMatchObject({ code: 'account-changed' });
    await provisionAccountProfile('alice'); expect(mock.invoke.mock.calls[1][1]).toEqual(request);
  });
  it('requires a real Auth creation timestamp before dispatch and keeps reincarnated accounts separate', async () => {
    const { provisionAccountProfile } = await import('./accountProfileService');
    mock.user.metadata.creationTime = undefined;
    await expect(provisionAccountProfile('alice')).rejects.toThrow('Sign in again'); expect(mock.invoke).not.toHaveBeenCalled();
    switchTo(); mock.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable' } });
    await expect(provisionAccountProfile('alice')).rejects.toBeTruthy();
    mock.user.metadata.creationTime = new Date(createdAt + 1000).toUTCString();
    await provisionAccountProfile('alice'); expect(mock.invoke.mock.calls[1][1].requestId).not.toBe(mock.invoke.mock.calls[0][1].requestId);
  });
  it('accepts an owned legacy profile without a username so onboarding can repair it', async () => {
    mock.invoke.mockImplementation(async (_name, request) => { const result = receipt(request); (result.data.profile as any).username = null; return result; });
    const { provisionAccountProfile } = await import('./accountProfileService');
    expect((await provisionAccountProfile('alice')).profile.username).toBe('');
  });
  it('never automatically recovers and exposes only sanitized review guidance', async () => {
    const error = { name: 'failed-precondition', message: 'private information must not display', details: { reason: 'profile-recovery-required', recoveryAvailable: true } };
    mock.invoke.mockResolvedValueOnce({ data: null, error });
    const { provisionAccountProfile, profileSetupFailure } = await import('./accountProfileService');
    await expect(provisionAccountProfile('alice')).rejects.toBe(error);
    expect(mock.invoke).toHaveBeenCalledTimes(1); expect(profileSetupFailure(error)).toEqual({ title: 'Confirm your profile', message: expect.stringContaining('Choose Recover profile'), recoveryAvailable: true });
    await provisionAccountProfile('alice', { action: 'recover' });
    expect(mock.invoke.mock.calls[1][1].action).toBe('recover');
  });
  it('ends a stalled setup after 15 seconds, retries the same receipt and ignores late completion', async () => {
    vi.useFakeTimers();
    const held = deferred<any>(); mock.invoke.mockReturnValueOnce(held.promise);
    const { provisionAccountProfile } = await import('./accountProfileService');
    const pending = provisionAccountProfile('alice');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'deadline-exceeded' });
    await vi.advanceTimersByTimeAsync(0);
    const original = mock.invoke.mock.calls[0][1];
    await vi.advanceTimersByTimeAsync(15_000); await rejected;
    await provisionAccountProfile('alice');
    expect(mock.invoke.mock.calls[1][1]).toEqual(original);
    held.resolve(receipt(original)); await vi.advanceTimersByTimeAsync(0);
    expect(sessionStorage.getItem('vybe:profile-setup-attempts:v1')).toBe('[]');
  });
});
