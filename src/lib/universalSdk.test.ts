// @vitest-environment node
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VybeIntegration, type HostCapture, type VybeHostAdapter, type PreparedCapture } from '../../sdk/universal/index';

const BASE = 'https://partner.example/gamePartnerApi';
const ID = 'a'.repeat(48);
const TOKEN = `vyp_${'t'.repeat(43)}`;
const DEVICE = `vyd_${'d'.repeat(43)}`;
const media = (): HostCapture => ({ media: new Uint8Array(12).fill(7), contentType: 'image/png', caption: 'A mod capture', tags: ['mod'] });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
type Call = { path: string; init: RequestInit };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function harness(options: { host?: Partial<VybeHostAdapter>; handle?: (call: Call) => Promise<Response> | Response | undefined } = {}) {
  const calls: Call[] = [];
  let onDispose = () => {};
  const unsubscribe = vi.fn();
  const openExternal = vi.fn();
  let connection = 'b'.repeat(32);
  let receipt = { captureId: ID, status: 'uploading', gameId: 'test-mod', gameName: 'Test Mod', contentType: 'image/png', byteSize: 12, caption: '', tags: [], expiresAt: Date.now() + 600_000, postId: null };
  const fetcher = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { path: String(url).slice(BASE.length), init }; calls.push(call);
    const intercepted = options.handle?.(call); if (intercepted) return intercepted;
    if (call.path === '/v1/device/code') return json({ deviceCode: DEVICE, userCode: 'ABCD-2345', verificationUri: 'https://vybehub.app/connect/game', verificationUriComplete: `https://evil.example/${DEVICE}`, expiresIn: 600, interval: 5 });
    if (call.path === '/v1/device/token') return json({ accessToken: TOKEN, tokenType: 'Bearer', connectionId: connection, expiresIn: 600, expiresAt: Date.now() + 600_000, scopes: ['capture:write', 'capture:status'] });
    if (call.path === '/v1/captures' && init.method === 'POST') { const input = JSON.parse(String(init.body)); receipt = { ...receipt, caption: input.caption, tags: input.tags, contentType: input.contentType, byteSize: input.byteSize }; return json(receipt); }
    if (call.path.includes('/chunks/')) { const bytes = new Uint8Array(init.body as ArrayBuffer); return json({ index: 0, byteSize: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }); }
    if (call.path.endsWith('/finish')) return json({ ...receipt, status: 'ready' });
    if (call.path.endsWith('/revoke') || init.method === 'DELETE') return json({ ok: true });
    return json(receipt);
  });
  const client = new VybeIntegration({ clientId: 'test-mod', apiBaseUrl: BASE, fetch: fetcher, host: { openExternal, capture: async () => media(), onDispose: callback => { onDispose = callback; return unsubscribe; }, ...options.host } });
  return { client, calls, fetcher, openExternal, unsubscribe, unload: () => onDispose(), relinkAs: (id: string) => { connection = id; } };
}
async function link(client: VybeIntegration) {
  vi.useFakeTimers(); await client.beginLink(); const wait = client.waitForLink(); await vi.advanceTimersByTimeAsync(5000); await wait; vi.useRealTimers();
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('universal host entry points', () => {
  it('constructs without network, capture or navigation', () => { const h = harness(); expect(h.calls).toEqual([]); expect(h.openExternal).not.toHaveBeenCalled(); expect(h.client.authorization).toBeNull(); });
  it('opens official links only on explicit calls without forwarding server URLs or credentials', async () => {
    const h = harness(); const code = await h.client.beginLink();
    code.verificationUriComplete = 'https://evil.example'; code.userCode = TOKEN;
    expect(h.openExternal).not.toHaveBeenCalled();
    await h.client.openLink(); await h.client.openVybe(); await h.client.openReview(ID);
    expect(h.openExternal.mock.calls.map(call => call[0])).toEqual(['https://vybehub.app/connect/game?code=ABCD-2345', 'https://vybehub.app/home', `https://vybehub.app/game-capture/${ID}`]);
    expect(JSON.stringify(h.openExternal.mock.calls)).not.toMatch(/vyd_|vyp_/);
    expect(() => h.client.openReview(`${ID}?access_token=secret`)).toThrow();
  });
  it('calls the host opener synchronously so a click can retain user activation', async () => {
    const h = harness(); const pending = h.client.openVybe(); expect(h.openExternal).toHaveBeenCalledOnce(); await pending;
  });
  it('rejects expired or absent linking entry points', async () => {
    const h = harness(); expect(() => h.client.openLink()).toThrow(); await h.client.beginLink(); vi.useFakeTimers(); vi.advanceTimersByTime(600_001); expect(() => h.client.openLink()).toThrow();
  });
  it('reports host opening failure without falsely confirming success', async () => {
    const h = harness({ host: { openExternal: () => { throw new Error('host details'); } } }); await expect(h.client.openVybe()).rejects.toMatchObject({ code: 'open_failed' });
  });
  it('requires a trusted opener adapter', () => { expect(() => new VybeIntegration({ clientId: 'test-mod', apiBaseUrl: BASE, host: {} as VybeHostAdapter })).toThrow(); });
});

describe('prepared capture identity and retries', () => {
  it('retains original media and metadata, retrying one key without recapturing', async () => {
    const original = media(); const capture = vi.fn(async () => original); const h = harness({ host: { capture } }); await link(h.client);
    const draft = await h.client.captureFromHost(); (original.media as Uint8Array).fill(99); original.tags![0] = 'changed'; original.caption = 'changed';
    const first = await h.client.stageCapture(draft); const second = await h.client.stageCapture(draft);
    expect(first.status).toBe('ready'); expect(second.status).toBe('ready'); expect(capture).toHaveBeenCalledOnce(); expect(h.openExternal).not.toHaveBeenCalled();
    const requests = h.calls.filter(call => call.path === '/v1/captures').map(call => JSON.parse(String(call.init.body)));
    expect(requests[0]).toEqual(requests[1]); expect(requests[0]).toMatchObject({ idempotencyKey: draft.idempotencyKey, caption: 'A mod capture', tags: ['mod'] });
    expect(requests[0].contentSha256).toBe(createHash('sha256').update(new Uint8Array(12).fill(7)).digest('hex'));
    expect(draft).not.toHaveProperty('media'); expect(Object.isFrozen(draft)).toBe(true);
  });
  it('supports directly supplied bytes without a native capture adapter', async () => {
    const h = harness({ host: { capture: undefined } }); await link(h.client); expect(() => h.client.captureFromHost()).toThrow(); const draft = await h.client.prepareCapture(media()); await expect(h.client.stageCapture(draft)).resolves.toMatchObject({ status: 'ready' });
  });
  it('rejects capture before account consent without invoking the host', () => {
    const capture = vi.fn(); const h = harness({ host: { capture } }); expect(() => h.client.captureFromHost()).toThrow(); expect(capture).not.toHaveBeenCalled();
  });
  it.each([{ contentType: 'text/plain' }, { media: new Uint8Array(11) }, { media: 'file:///secret' }, { tags: 'mod' }, { tags: ['x'.repeat(41)] }])('rejects invalid host media %j', async extra => {
    const h = harness(); await link(h.client); await expect(h.client.prepareCapture({ ...media(), ...extra } as HostCapture)).rejects.toBeInstanceOf(Error); expect(h.calls.some(call => call.path === '/v1/captures')).toBe(false);
  });
  it('rejects forged, foreign and explicitly released drafts', async () => {
    const a = harness(); const b = harness(); await link(a.client); await link(b.client); const draft = await a.client.prepareCapture(media());
    expect(() => b.client.stageCapture(draft)).toThrow(); expect(() => a.client.stageCapture({ ...draft } as PreparedCapture)).toThrow(); draft.dispose(); expect(() => a.client.stageCapture(draft)).toThrow();
  });
  it('never adopts an old draft after a fresh account link', async () => {
    const h = harness(); await link(h.client); const draft = await h.client.prepareCapture(media()); h.relinkAs('c'.repeat(32)); await link(h.client); expect(() => h.client.stageCapture(draft)).toThrow(); expect(h.calls.some(call => call.path === '/v1/captures')).toBe(false);
  });
  it('preserves the draft when server verification is unavailable for a later explicit retry', async () => {
    let fail = true; const h = harness({ handle: call => fail && call.path.endsWith('/finish') ? json({ error: 'rate_limited', retryAfter: 3600 }, 429) : undefined }); await link(h.client); const draft = await h.client.prepareCapture(media());
    await expect(h.client.stageCapture(draft)).rejects.toMatchObject({ code: 'rate_limited' }); fail = false; await expect(h.client.stageCapture(draft)).resolves.toMatchObject({ status: 'ready' });
    const keys = h.calls.filter(call => call.path === '/v1/captures').map(call => JSON.parse(String(call.init.body)).idempotencyKey); expect(keys).toEqual([draft.idempotencyKey, draft.idempotencyKey]);
  });
});

describe('unload, cancellation and stale host operations', () => {
  it('unload settles an uncooperative host capture and ignores its later completion', async () => {
    const pending = deferred<HostCapture>(); let signal!: AbortSignal; const h = harness({ host: { capture: options => { signal = options.signal; return pending.promise; } } }); await link(h.client);
    const result = h.client.captureFromHost(); const assertion = expect(result).rejects.toMatchObject({ code: 'disposed' }); h.unload(); await assertion; expect(signal.aborted).toBe(true); pending.resolve(media()); await Promise.resolve();
    expect(h.client.authorization).toBeNull(); expect(h.unsubscribe).toHaveBeenCalledOnce(); h.client.dispose(); expect(h.unsubscribe).toHaveBeenCalledOnce(); expect(h.calls.some(call => call.path === '/v1/captures')).toBe(false);
  });
  it('external cancellation does not revoke or claim to discard captures', async () => {
    const pending = deferred<HostCapture>(); const h = harness({ host: { capture: () => pending.promise } }); await link(h.client); const abort = new AbortController(); const capture = h.client.captureFromHost({ signal: abort.signal }); const assertion = expect(capture).rejects.toMatchObject({ code: 'aborted' }); abort.abort(); await assertion;
    expect(h.client.authorization).not.toBeNull(); expect(h.calls.some(call => call.init.method === 'DELETE' || call.path.endsWith('/revoke'))).toBe(false); pending.resolve(media());
  });
  it('does not invoke capture or network for an already aborted action', async () => {
    const capture = vi.fn(); const h = harness({ host: { capture } }); await link(h.client); const controller = new AbortController(); controller.abort(); await expect(h.client.captureFromHost({ signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' }); expect(capture).not.toHaveBeenCalled();
  });
  it('aborts an in-flight upload and suppresses all later callbacks on unload', async () => {
    const pending = deferred<Response>(); let uploadSignal!: AbortSignal; const h = harness({ handle: call => { if (call.path.includes('/chunks/')) { uploadSignal = call.init.signal!; return pending.promise; } } }); await link(h.client); const draft = await h.client.prepareCapture(media()); const progress = vi.fn(); const phase = vi.fn();
    const outcome = h.client.stageCapture(draft, { onProgress: progress, onPhase: phase }); const rejected = expect(outcome).rejects.toMatchObject({ code: 'disposed' }); await vi.waitFor(() => expect(uploadSignal).toBeDefined()); h.unload(); await rejected; const count = progress.mock.calls.length + phase.mock.calls.length; pending.resolve(json({ index: 0, byteSize: 12, sha256: createHash('sha256').update(new Uint8Array(12).fill(7)).digest('hex') })); await new Promise(resolve => setTimeout(resolve, 0));
    expect(uploadSignal.aborted).toBe(true); expect(progress.mock.calls.length + phase.mock.calls.length).toBe(count); expect(h.calls.some(call => call.path.endsWith('/finish'))).toBe(false);
  });
  it('callback-triggered closure cannot send later chunks', async () => {
    const h = harness(); await link(h.client); const draft = await h.client.prepareCapture(media()); await expect(h.client.stageCapture(draft, { onCaptureReserved: () => h.client.dispose() })).rejects.toMatchObject({ code: 'disposed' }); expect(h.calls.some(call => call.path.includes('/chunks/'))).toBe(false);
  });
  it('a new link cancels old polling without losing its new open link', async () => {
    const h = harness(); await h.client.beginLink(); const pending = h.client.waitForLink(); const rejected = expect(pending).rejects.toMatchObject({ code: 'aborted' }); await h.client.beginLink(); await rejected; await h.client.openLink(); expect(h.openExternal).toHaveBeenCalledOnce();
  });
  it('a duplicate wait cannot remove the first wait\'s active consent link', async () => {
    const h = harness(); await h.client.beginLink(); const controller = new AbortController(); const pending = h.client.waitForLink({ signal: controller.signal }); const rejected = expect(pending).rejects.toMatchObject({ code: 'aborted' });
    await expect(h.client.waitForLink()).rejects.toMatchObject({ code: 'conflict' }); await h.client.openLink(); expect(h.openExternal).toHaveBeenCalledOnce(); controller.abort(); await rejected;
  });
  it('synchronous host disposal during registration still unsubscribes', () => {
    const unsubscribe = vi.fn(); const h = harness({ host: { onDispose: callback => { callback(); return unsubscribe; } } }); expect(unsubscribe).toHaveBeenCalledOnce(); expect(h.client.authorization).toBeNull(); expect(() => h.client.beginLink()).toThrow();
  });
  it('explicit revoke makes the server request and removes local draft/session access', async () => {
    const h = harness(); await link(h.client); const draft = await h.client.prepareCapture(media()); await h.client.revokeConnection(); expect(h.calls.filter(call => call.path.endsWith('/revoke'))).toHaveLength(1); expect(h.client.authorization).toBeNull(); expect(() => h.client.stageCapture(draft)).toThrow();
  });
});
