import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn(), token: vi.fn(), user: null as null | { uid: string; getIdToken: () => Promise<string> }, generation: 0, localPreview: false }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => mocks.call }));
vi.mock('./app', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('./config', () => ({ getFirebaseConfig: () => ({ projectId: 'demo-vybe-preview', functionsRegion: 'us-central1' }) }));
vi.mock('./authService', () => ({ firebaseAuth: {}, getFirebaseAuth: () => ({ currentUser: mocks.user }), getAuthSessionGeneration: () => mocks.generation }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => mocks.localPreview, LOCAL_PREVIEW_PORTS: { functions: 5101 } }));
import { getFunctionUrl, invokeFunction } from './functionsService';
import { withPostReadDeadline } from '../postReadDeadline';
import { readSocialFeed } from '../socialFeedService';

describe('owned read token preparation', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.generation = 0; mocks.localPreview = false; mocks.user = { uid: 'viewer', getIdToken: mocks.token }; mocks.token.mockResolvedValue('synthetic-token'); mocks.call.mockResolvedValue({ data: { ok: true } }); });
  afterEach(() => { mocks.user = null; });
  it('preserves token network failure and never dispatches an anonymous read', async () => {
    mocks.token.mockRejectedValue(Object.assign(new Error('Network failed'), { code: 'auth/network-request-failed' }));
    const result = await invokeFunction('readSocialFeed', {}, { expectedOwnerUid: 'viewer', guard: () => {} });
    expect(result.error?.name).toBe('auth/network-request-failed'); expect(mocks.call).not.toHaveBeenCalled();
  });
  it('holds dispatch until the captured token is ready', async () => {
    let finish!: (value: string) => void; mocks.token.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const result = invokeFunction('readSocialFeed', {}, { expectedOwnerUid: 'viewer', guard: () => {} });
    expect(mocks.call).not.toHaveBeenCalled(); finish('synthetic-token');
    expect((await result).error).toBeNull(); expect(mocks.call).toHaveBeenCalledOnce();
    expect(mocks.token).toHaveBeenCalledWith();
  });
  it('retires a token wait when the caller deadline or view guard retires', async () => {
    let finish!: (value: string) => void, active = true;
    mocks.token.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const result = invokeFunction('readSocialFeed', {}, { expectedOwnerUid: 'viewer', guard: () => { if (!active) throw Object.assign(new Error('Expired read'), { code: 'deadline-exceeded' }); } });
    active = false; finish('synthetic-token');
    expect((await result).error?.name).toBe('deadline-exceeded'); expect(mocks.call).not.toHaveBeenCalled();
  });
  it('rejects account changes away and back even with the same SDK user', async () => {
    let finish!: (value: string) => void; mocks.token.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const result = invokeFunction('readSocialFeed', {}, { expectedOwnerUid: 'viewer', guard: () => {} });
    mocks.generation += 2; finish('synthetic-token');
    expect((await result).error?.name).toBe('account-changed'); expect(mocks.call).not.toHaveBeenCalled();
  });
  it('requires the requested current owner before requesting a token', async () => {
    const result = await invokeFunction('readSocialFeed', {}, { expectedOwnerUid: 'other', guard: () => {} });
    expect(result.error?.name).toBe('account-changed'); expect(mocks.token).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
  });
  it('bounds a stalled token with the existing post deadline and rejects its late dispatch', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (value: string) => void;
      mocks.token.mockReturnValue(new Promise(resolve => { finish = resolve; }));
      const result = withPostReadDeadline(current => invokeFunction('readSocialFeed', {}, { expectedOwnerUid: 'viewer', guard: current }), () => {}, new AbortController().signal);
      const rejected = expect(result).rejects.toMatchObject({ code: 'deadline-exceeded' });
      await vi.advanceTimersByTimeAsync(15000); await rejected;
      finish('synthetic-token'); await vi.advanceTimersByTimeAsync(0);
      expect(mocks.call).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('lets the actual feed preserve a recoverable token error and then render an admitted retry', async () => {
    const input = { expectedOwnerUid: 'viewer', expectedProfileId: 'profile-viewer' };
    const guard = () => {};
    mocks.token.mockRejectedValueOnce(Object.assign(new Error('Network failed'), { code: 'auth/network-request-failed' }));
    await expect(readSocialFeed(input, guard)).rejects.toMatchObject({ code: 'auth/network-request-failed' });
    expect(mocks.call).not.toHaveBeenCalled();
    mocks.call.mockResolvedValue({ data: { ownerUid: 'viewer', viewerProfileId: 'profile-viewer', contentType: null, feed: 'discover', nextCursor: null,
      posts: [{ id: 'post-one', type: 'post', caption: 'Admitted post', createdAt: '2026-10-06T12:00:00.000Z', publicationRevision: 'a'.repeat(48), needsOwnerConfirmation: false,
        mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'safe', tags: [], likeCount: 0, commentCount: 0, viewCount: 0,
        isPinned: false, isBookmarked: false, reactionType: null, author: { id: 'profile-viewer', username: 'viewer', displayName: null, avatarUrl: null } }] } });
    expect((await readSocialFeed(input, guard)).posts).toMatchObject([{ id: 'post-one', caption: 'Admitted post' }]);
    expect(mocks.call).toHaveBeenCalledOnce();
  });
});

describe('callable result classification', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.localPreview = false; vi.stubEnv('VITE_LOCAL_PREVIEW_DIAGNOSTICS', 'true'); vi.stubGlobal('location', { origin: 'http://127.0.0.1:8082' }); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it.each([{ ok: false }, { ok: false, error: 'expired' }, { ok: false, skipped: 'daily_cap' }])('preserves a supported domain rejection %j', async data => {
    mocks.call.mockResolvedValue({ data });
    expect(await invokeFunction('test-domain')).toEqual({ data, error: null });
  });
  it('reports explicitly unfinished endpoints as errors', async () => {
    mocks.call.mockResolvedValue({ data: { ok: false, error: 'not_yet_ported' } });
    expect(await invokeFunction('test-pending')).toEqual({ data: null, error: { name: 'not_yet_ported', message: 'not_yet_ported' } });
  });
  it('preserves permission rejection without reporting success', async () => {
    mocks.call.mockRejectedValue({ code: 'functions/permission-denied', message: 'Not allowed' });
    expect(await invokeFunction('test-auth')).toEqual({ data: null, error: { name: 'permission-denied', message: 'Not allowed' } });
  });
  it('logs only a local callable name, endpoint and normalized failure code', async () => {
    mocks.localPreview = true; vi.stubEnv('DEV', true);
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    mocks.call.mockRejectedValue({ code: 'functions/deadline-exceeded', message: 'private SDK detail', details: { token: 'private-token' } });
    const result = await invokeFunction('get-game-capture', { captureId: 'private-capture-id', email: 'private@example.test' });
    expect(result.error?.name).toBe('deadline-exceeded');
    expect(log.mock.calls).toEqual([
      ['[VYBE local callable] start name=getGameCapture endpoint=http://127.0.0.1:8082/demo-vybe-preview/us-central1/getGameCapture'],
      ['[VYBE local callable] failure name=getGameCapture endpoint=http://127.0.0.1:8082/demo-vybe-preview/us-central1/getGameCapture code=deadline-exceeded'],
    ]);
  });
  it.each([{ dev: false, preview: true }, { dev: true, preview: false }])('does not log outside local development: %j', async ({ dev, preview }) => {
    mocks.localPreview = preview; vi.stubEnv('DEV', dev);
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    mocks.call.mockRejectedValue({ code: 'functions/unavailable' });
    await invokeFunction('get-game-capture', { secret: 'private' });
    expect(log).not.toHaveBeenCalled();
  });
  it('does not log arbitrary callable names or SDK error codes', async () => {
    mocks.localPreview = true; vi.stubEnv('DEV', true);
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    mocks.call.mockRejectedValue({ code: 'functions/private@example.test' });
    await invokeFunction('private@example.test');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.test');
    expect(log.mock.calls[1][0]).toContain('code=unknown');
  });
  it('keeps a successful request working if diagnostic logging fails', async () => {
    mocks.localPreview = true; vi.stubEnv('DEV', true);
    vi.spyOn(console, 'debug').mockImplementation(() => { throw new Error('console unavailable'); });
    mocks.call.mockResolvedValue({ data: { ok: true } });
    expect(await invokeFunction('test-domain')).toEqual({ data: { ok: true }, error: null });
  });
  it('uses the current QA origin for raw Function URLs and retains normal cloud routing', () => {
    mocks.localPreview = true;
    expect(getFunctionUrl('getGameCapture')).toBe('http://127.0.0.1:8082/demo-vybe-preview/us-central1/getGameCapture');
    vi.stubGlobal('location', { origin: 'http://localhost:8082' });
    expect(getFunctionUrl('getGameCapture')).toBe('http://localhost:8082/demo-vybe-preview/us-central1/getGameCapture');
    mocks.localPreview = false;
    expect(getFunctionUrl('getGameCapture')).toBe('https://us-central1-demo-vybe-preview.cloudfunctions.net/getGameCapture');
  });
  it.each([undefined, '', 'false', '1', 'TRUE'])('leaves tracing disabled unless explicitly opted in: %j', flag => {
    mocks.localPreview = true; vi.stubEnv('DEV', true); vi.stubEnv('VITE_LOCAL_PREVIEW_DIAGNOSTICS', flag);
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    mocks.call.mockResolvedValue({ data: { ok: true } });
    return invokeFunction('getGameCapture').then(() => { expect(log).not.toHaveBeenCalled(); });
  });
});
