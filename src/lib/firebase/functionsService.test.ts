import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ call: vi.fn(), localPreview: false }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: () => mocks.call }));
vi.mock('./app', () => ({ getFirebaseApp: () => ({}) }));
vi.mock('./config', () => ({ getFirebaseConfig: () => ({ projectId: 'demo-vybe-preview', functionsRegion: 'us-central1' }) }));
vi.mock('./authService', () => ({ firebaseAuth: {} }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => mocks.localPreview, LOCAL_PREVIEW_PORTS: { functions: 5101 } }));
import { getFunctionUrl, invokeFunction } from './functionsService';

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
