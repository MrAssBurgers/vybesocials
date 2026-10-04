import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const preview = vi.hoisted(() => ({ enabled: true }));
vi.mock('./localPreview', () => ({ isLocalPreview: () => preview.enabled, LOCAL_PREVIEW_PORTS: { functions: 5101 }, LOCAL_PREVIEW_PROJECT: 'demo-vybe-preview' }));
import { installLocalPreviewFetchDiagnostics } from './localPreviewFetchDiagnostics';

const endpoint = 'http://127.0.0.1:5101/demo-vybe-preview/us-central1/getGameCapture';
const installedKey = Symbol.for('vybe.localPreview.fetchDiagnostics');
const scope = globalThis as typeof globalThis & { [installedKey]?: boolean };

describe('isolated preview fetch diagnostics', () => {
  beforeEach(() => { preview.enabled = true; vi.stubEnv('DEV', true); vi.stubEnv('VITE_LOCAL_PREVIEW_DIAGNOSTICS', 'true'); vi.stubGlobal('location', { origin: 'http://127.0.0.1:8082' }); delete scope[installedKey]; });
  afterEach(() => { delete scope[installedKey]; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('forwards the exact request and real response without reading bodies or secrets', async () => {
    const response = new Response('{"private":"result"}', { status: 200 });
    const read = vi.spyOn(response, 'text'); const clone = vi.spyOn(response, 'clone');
    const underlying = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', underlying);
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    installLocalPreviewFetchDiagnostics();
    const input = new URL(`${endpoint}?secret=private-query#private-fragment`);
    const init = { method: 'POST', headers: { Authorization: 'Bearer private-token' }, body: 'private-body' };
    expect(await fetch(input, init)).toBe(response);
    expect(underlying).toHaveBeenCalledExactlyOnceWith(input, init);
    expect(read).not.toHaveBeenCalled(); expect(clone).not.toHaveBeenCalled(); expect(response.bodyUsed).toBe(false);
    expect(log.mock.calls).toEqual([
      [`[VYBE local fetch] entry request=1 endpoint=${endpoint}`],
      [`[VYBE local fetch] response request=1 endpoint=${endpoint} status=200`],
    ]);
  });
  it('distinguishes a pending fetch from headers received without adding a timeout', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    installLocalPreviewFetchDiagnostics(); const pending = fetch(endpoint);
    expect(log).toHaveBeenCalledTimes(1);
    resolve(new Response(null, { status: 401 })); await pending;
    expect(log.mock.calls[1][0]).toContain('status=401');
  });
  it('rethrows the original error without logging its potentially private detail', async () => {
    const error = new Error('private network detail'); vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    installLocalPreviewFetchDiagnostics(); await expect(fetch(endpoint)).rejects.toBe(error);
    expect(log.mock.calls[1][0]).toBe(`[VYBE local fetch] rejected request=1 endpoint=${endpoint}`);
  });
  it('also observes the exact same-origin demo Functions proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const proxyEndpoint = endpoint.replace(':5101/', ':8082/');
    installLocalPreviewFetchDiagnostics(); await fetch(proxyEndpoint);
    expect(log.mock.calls[0][0]).toBe(`[VYBE local fetch] entry request=1 endpoint=${proxyEndpoint}`);
  });
  it.each([
    'https://us-central1-real-project.cloudfunctions.net/getGameCapture',
    'http://127.0.0.1:5101/real-project/us-central1/getGameCapture',
    'http://127.0.0.1:5101/demo-vybe-preview/europe-west1/getGameCapture',
    'http://127.0.0.1:5101/demo-vybe-preview/us-central1/private@example.test',
    'http://127.0.0.1:8280/demo-vybe-preview/us-central1/getGameCapture',
    'http://private:secret@127.0.0.1:5101/demo-vybe-preview/us-central1/getGameCapture',
  ])('does not observe requests outside the exact demo endpoint: %s', async url => {
    const underlying = vi.fn().mockResolvedValue(new Response()); vi.stubGlobal('fetch', underlying);
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    installLocalPreviewFetchDiagnostics(); await fetch(url);
    expect(log).not.toHaveBeenCalled(); expect(underlying).toHaveBeenCalledExactlyOnceWith(url, undefined);
  });
  it.each([{ dev: false, preview: true }, { dev: true, preview: false }])('leaves fetch untouched outside QA: %j', ({ dev, preview: enabled }) => {
    preview.enabled = enabled; vi.stubEnv('DEV', dev);
    const underlying = vi.fn(); vi.stubGlobal('fetch', underlying);
    installLocalPreviewFetchDiagnostics(); expect(fetch).toBe(underlying);
  });
  it('installs only once even if a reporting hook wraps fetch before HMR', async () => {
    const underlying = vi.fn().mockResolvedValue(new Response()); vi.stubGlobal('fetch', underlying);
    const log = vi.spyOn(console, 'debug').mockImplementation(() => {});
    installLocalPreviewFetchDiagnostics(); const first = fetch;
    const reportingWrapper: typeof fetch = (...args) => first(...args); scope.fetch = reportingWrapper;
    installLocalPreviewFetchDiagnostics(); expect(fetch).toBe(reportingWrapper); await fetch(endpoint);
    expect(underlying).toHaveBeenCalledTimes(1); expect(log).toHaveBeenCalledTimes(2);
  });
  it('forwards correctly when console logging itself fails', async () => {
    const response = new Response(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    vi.spyOn(console, 'debug').mockImplementation(() => { throw new Error('console failed'); });
    installLocalPreviewFetchDiagnostics(); expect(await fetch(endpoint)).toBe(response);
  });
  it.each([undefined, '', 'false', '1', 'TRUE'])('leaves native fetch untouched without explicit opt-in: %j', flag => {
    vi.stubEnv('VITE_LOCAL_PREVIEW_DIAGNOSTICS', flag);
    const underlying = vi.fn(); vi.stubGlobal('fetch', underlying);
    installLocalPreviewFetchDiagnostics(); expect(fetch).toBe(underlying); expect(scope[installedKey]).toBeUndefined();
  });
});
