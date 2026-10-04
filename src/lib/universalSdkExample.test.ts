import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HTML = readFileSync('sdk/examples/file-picker/index.html', 'utf8');
const SOURCE = readFileSync('sdk/examples/file-picker/app.js', 'utf8')
  .replace("import { VybeIntegration } from '/sdk/universal/index.js';", '')
  .replace("import { config } from './config.js';", '');
const ID = 'a'.repeat(48);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const el = (id: string) => document.getElementById(id) as HTMLButtonElement;
type Host = { capture(options: { signal: AbortSignal }): Promise<unknown>; onDispose(callback: () => void): () => void };
let instance: ExampleClient;
function remember(value: ExampleClient) { instance = value; }
let unregister: () => void;
class ExampleClient {
  authorization: object | null = null;
  waiting = deferred<object>();
  original = { idempotencyKey: 'one-draft', dispose: vi.fn() };
  beginLink = vi.fn(async () => ({ userCode: 'ABCD-2345' }));
  waitForLink = vi.fn(async () => { await this.waiting.promise; this.authorization = {}; });
  openLink = vi.fn();
  openVybe = vi.fn();
  openReview = vi.fn();
  discardCapture = vi.fn(async () => {});
  revokeConnection = vi.fn(async () => { this.authorization = null; });
  dispose = vi.fn();
  stageCapture = vi.fn(async (_draft: unknown, options: { onCaptureReserved(id: string): void }) => { options.onCaptureReserved(ID); return { captureId: ID, status: 'ready' }; });
  captureFromHost = vi.fn(async (options: { signal: AbortSignal }) => { await this.host.capture(options); return this.original; });
  host: Host;
  constructor(options: { host: Host }) { remember(this); this.host = options.host; unregister = this.host.onDispose(this.dispose); }
}
function boot(config = { clientId: 'test-mod', apiBaseUrl: 'https://fixed.example/api' }) {
  // Execute the shipped example controller in an isolated test DOM. Only its SDK
  // transport is controlled; these checks do not claim live provider success.
  new Function('VybeIntegration', 'config', SOURCE)(ExampleClient, config);
}
async function connected() { el('connect').click(); await vi.waitFor(() => expect(el('code').textContent).toContain('ABCD-2345')); instance.waiting.resolve({}); await vi.waitFor(() => expect(el('status').textContent).toContain('Connected.')); }
function chooseFile() {
  Object.defineProperty(el('file'), 'files', { configurable: true, value: [new File(['encoded bytes'], 'capture.png', { type: 'image/png' })] });
  el('file').dispatchEvent(new Event('change'));
}
const listeners: Array<[string, EventListenerOrEventListenerObject]> = [];
beforeEach(() => {
  document.body.innerHTML = new DOMParser().parseFromString(HTML, 'text/html').body.innerHTML;
  const realAdd = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, callback, options) => { if (callback) listeners.push([type, callback as EventListener]); realAdd(type, callback, options); });
});
afterEach(() => { unregister?.(); for (const [type, callback] of listeners.splice(0)) window.removeEventListener(type, callback); vi.restoreAllMocks(); });

describe('runnable app/mod example', () => {
  it('does not claim connection or send requests on mount', () => { boot(); expect(instance.beginLink).not.toHaveBeenCalled(); expect(instance.stageCapture).not.toHaveBeenCalled(); expect(el('upload').disabled).toBe(true); expect(el('status').textContent).toBe('No media uploaded.'); });
  it('stays disabled with configuration guidance until a real endpoint is supplied', () => { boot({ clientId: 'replace-with-registered-client', apiBaseUrl: '' }); expect(el('connect').disabled).toBe(true); expect(el('configuration').textContent).toContain('fixed HTTPS endpoint'); });
  it('opens consent only from its separate explicit action', async () => { boot(); el('connect').click(); await vi.waitFor(() => expect(el('open-link').disabled).toBe(false)); expect(instance.openLink).not.toHaveBeenCalled(); el('open-link').click(); expect(instance.openLink).toHaveBeenCalledOnce(); instance.waiting.resolve({}); await vi.waitFor(() => expect(el('open-link').disabled).toBe(true)); });
  it('retries an unavailable upload with the original draft and never claims it published', async () => {
    boot(); await connected(); chooseFile(); instance.stageCapture.mockRejectedValueOnce(new Error('Service unavailable; retry later.'));
    el('upload').click(); await vi.waitFor(() => expect(el('status').textContent).toContain('Service unavailable'));
    expect(el('review').disabled).toBe(true); expect(el('retry').disabled).toBe(false); expect(el('caption').disabled).toBe(true);
    el('retry').click(); await vi.waitFor(() => expect(el('status').textContent).toContain('Private capture ready'));
    expect(instance.captureFromHost).toHaveBeenCalledOnce(); expect(instance.stageCapture.mock.calls[0][0]).toBe(instance.stageCapture.mock.calls[1][0]);
    expect(instance.openReview).not.toHaveBeenCalled(); el('review').click(); expect(instance.openReview).toHaveBeenCalledWith(ID);
  });
  it('waits for discard acknowledgement and preserves the draft on failure', async () => {
    boot(); await connected(); chooseFile(); el('upload').click(); await vi.waitFor(() => expect(el('review').disabled).toBe(false));
    instance.discardCapture.mockRejectedValueOnce(new Error('Discard was not confirmed.')); el('discard').click(); await vi.waitFor(() => expect(el('status').textContent).toContain('not confirmed'));
    expect(instance.original.dispose).not.toHaveBeenCalled(); expect(el('review').disabled).toBe(false); el('discard').click(); await vi.waitFor(() => expect(el('status').textContent).toBe('Private capture discarded.')); expect(instance.original.dispose).toHaveBeenCalledOnce();
  });
  it('page teardown aborts host work and prevents a late success from updating UI', async () => {
    boot(); await connected(); chooseFile(); const pending = deferred<typeof instance.original>(); let signal!: AbortSignal;
    instance.captureFromHost.mockImplementationOnce(options => { signal = options.signal; return pending.promise; }); el('upload').click();
    window.dispatchEvent(new Event('pagehide')); expect(signal.aborted).toBe(true); expect(instance.dispose).toHaveBeenCalledOnce(); pending.resolve(instance.original); await Promise.resolve(); await Promise.resolve(); expect(instance.stageCapture).not.toHaveBeenCalled(); expect(el('status').textContent).not.toContain('Private capture ready');
  });
});
