// @vitest-environment node
import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARTNER_CHUNK_BYTES, VybePartnerClient, VybePartnerError, type PartnerCaptureReceipt } from '../../sdk/game/http';

const BASE = 'https://partner.example/gamePartnerApi';
const DEVICE = `vyd_${'d'.repeat(43)}`;
const TOKEN = `vyp_${'t'.repeat(43)}`;
const ID = 'a'.repeat(48);
const CODE = 'ABCD-2345';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const failure = (error: string, status = 400, extra = {}) => json({ error, ...extra }, status);
const device = (extra = {}) => ({ deviceCode: DEVICE, userCode: CODE, verificationUri: 'https://vybehub.app/connect/game', verificationUriComplete: `https://evil.example/?device_code=${DEVICE}`, expiresIn: 600, interval: 5, ...extra });
const token = (extra = {}) => ({ accessToken: TOKEN, tokenType: 'Bearer', connectionId: 'b'.repeat(32), expiresIn: 600, expiresAt: Date.now() + 600_000, scopes: ['capture:write', 'capture:status'], ...extra });
const receipt = (extra = {}): PartnerCaptureReceipt => ({ captureId: ID, status: 'uploading', gameId: 'test-game', gameName: 'Test Game', contentType: 'image/png', byteSize: 12, caption: '', tags: [], expiresAt: Date.now() + 600_000, postId: null, reviewUrl: `https://vybehub.app/game-capture/${ID}`, ...extra });
type Call = { url: string; init: RequestInit; path: string };
type Handler = (call: Call) => Response | Promise<Response> | undefined;
function harness(handler?: Handler) {
  const calls: Call[] = [];
  let current = receipt();
  const fetcher = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const call = { url: String(url), init, path: String(url).slice(BASE.length) };
    calls.push(call);
    const custom = await handler?.(call);
    if (custom) return custom;
    if (call.path === '/v1/device/code') return json(device());
    if (call.path === '/v1/device/token') return json(token());
    if (call.path === '/v1/captures' && init.method === 'POST') {
      const body = JSON.parse(String(init.body));
      current = receipt({ byteSize: body.byteSize, contentType: body.contentType, caption: body.caption, tags: body.tags });
      return json(current);
    }
    if (call.path.includes('/chunks/')) {
      const bytes = new Uint8Array(init.body as ArrayBuffer);
      return json({ index: Number(call.path.split('/').at(-1)), byteSize: bytes.byteLength, sha256: hash(bytes) });
    }
    if (call.path.endsWith('/finish')) return json({ ...current, status: 'ready' });
    if (call.path === '/v1/connection/revoke' || init.method === 'DELETE') return json({ ok: true });
    return json(current);
  });
  const client = new VybePartnerClient({ clientId: 'test-game', apiBaseUrl: BASE, fetch: fetcher });
  return { client, calls, fetcher };
}
async function link(client: VybePartnerClient) {
  vi.useFakeTimers();
  await client.startDeviceAuthorization();
  const pending = client.waitForAuthorization();
  await vi.advanceTimersByTimeAsync(5000);
  const result = await pending;
  vi.useRealTimers();
  return result;
}
const capture = (extra = {}) => ({ idempotencyKey: 'capture_123', contentType: 'image/png' as const, media: new Uint8Array(12).fill(7), ...extra });

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('partner endpoint and credential boundaries', () => {
  it.each(['http://partner.example/api', 'https://user:password@partner.example/api', 'https://partner.example/api?secret=x', 'https://partner.example/api#x', 'file:///api', 'http://localhost:5001/api'])('rejects unsafe base %s', apiBaseUrl => {
    expect(() => new VybePartnerClient({ clientId: 'test-game', apiBaseUrl })).toThrow(VybePartnerError);
  });
  it('allows only explicit HTTP loopback emulators', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) expect(() => new VybePartnerClient({ clientId: 'test-game', apiBaseUrl: `http://${host}:5001/api`, allowInsecureLoopback: true })).not.toThrow();
    expect(() => new VybePartnerClient({ clientId: 'test-game', apiBaseUrl: 'http://localhost.evil.example/api', allowInsecureLoopback: true })).toThrow();
  });
  it('keeps device/token secrets private and constructs public links itself', async () => {
    const { client, calls } = harness();
    const publicLink = await client.startDeviceAuthorization();
    expect(publicLink.verificationUriComplete).toBe(`https://vybehub.app/connect/game?code=${CODE}`);
    expect(JSON.stringify(publicLink)).not.toContain(DEVICE);
    const authorization = await link(client);
    expect(JSON.stringify(authorization)).not.toContain(TOKEN);
    const result = await client.getCapture(ID);
    expect(result).not.toHaveProperty('storagePath');
    for (const call of calls) {
      expect(call.url).not.toMatch(/vyd_|vyp_|device_code|access_token/);
      expect(call.init).toMatchObject({ redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
      const headers = new Headers(call.init.headers);
      expect(headers.get('Authorization')).toBe(call.path.startsWith('/v1/device/') ? null : `Bearer ${TOKEN}`);
    }
    expect(JSON.parse(String(calls.find(call => call.path === '/v1/device/token')!.init.body))).toEqual({ clientId: 'test-game', deviceCode: DEVICE });
  });
  it.each([
    { verificationUri: 'https://evil.example/connect/game' }, { deviceCode: 'firebase-credential' },
    { userCode: 'IIII-OOOO' }, { interval: 0 }, { expiresIn: 601 },
  ])('rejects malformed or untrusted device responses %j', async extra => {
    const { client } = harness(call => call.path === '/v1/device/code' ? json(device(extra)) : undefined);
    await expect(client.startDeviceAuthorization()).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects Firebase-like credentials and unexpected token scopes', async () => {
    for (const extra of [{ accessToken: 'eyJ.firebase.jwt' }, { scopes: ['capture:write', 'capture:status', 'post:publish'] }, { connectionId: 'owner-user-id' }]) {
      vi.useFakeTimers();
      const { client } = harness(call => call.path === '/v1/device/token' ? json(token(extra)) : undefined);
      await client.startDeviceAuthorization();
      const outcome = expect(client.waitForAuthorization()).rejects.toMatchObject({ code: 'invalid_response' });
      await vi.advanceTimersByTimeAsync(5000);
      await outcome;
      expect(client.authorization).toBeNull();
      vi.useRealTimers();
    }
  });
  it('rejects redirecting polyfills and never follows server-provided URLs', async () => {
    for (const prop of [{ redirected: true }, { url: 'https://evil.example/capture' }]) {
      const { client, calls } = harness(call => {
        if (!call.path.startsWith('/v1/captures/')) return;
        const response = json(receipt());
        for (const [key, value] of Object.entries(prop)) Object.defineProperty(response, key, { value });
        return response;
      });
      await link(client);
      await expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'invalid_response' });
      expect(calls.every(call => call.url.startsWith(`${BASE}/v1/`))).toBe(true);
    }
  });
  it('does not expose arbitrary server messages or unknown errors', async () => {
    const secret = 'private-user-data-secret';
    const { client } = harness(call => call.path.includes('/captures/') ? failure(secret, 400, { message: `${TOKEN} ${secret}` }) : undefined);
    await link(client);
    const error = await client.getCapture(ID).catch(error => error);
    expect(error).toMatchObject({ code: 'invalid_request' });
    expect(`${error} ${JSON.stringify(error)}`).not.toMatch(/private-user|vyp_/);
  });
});

describe('device authorization lifecycle', () => {
  it('waits five seconds and honors pending, slow_down and rate limits', async () => {
    vi.useFakeTimers();
    const sequence = [failure('authorization_pending'), failure('slow_down', 400, { retryAfter: 10 }), failure('rate_limited', 429, { retryAfter: 20 })];
    const { client, calls } = harness(call => call.path === '/v1/device/token' ? sequence.shift() || json(token()) : undefined);
    await client.startDeviceAuthorization();
    const pending = client.waitForAuthorization();
    const polls = () => calls.filter(call => call.path === '/v1/device/token').length;
    await vi.advanceTimersByTimeAsync(4999); expect(polls()).toBe(0);
    await vi.advanceTimersByTimeAsync(1); expect(polls()).toBe(1);
    await vi.advanceTimersByTimeAsync(5000); expect(polls()).toBe(2);
    await vi.advanceTimersByTimeAsync(9999); expect(polls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1); expect(polls()).toBe(3);
    await vi.advanceTimersByTimeAsync(20_000); expect(polls()).toBe(4);
    await expect(pending).resolves.toMatchObject({ connectionId: 'b'.repeat(32) });
  });
  it.each(['access_denied', 'expired_token', 'invalid_grant'])('stops on %s without retaining a device request', async code => {
    vi.useFakeTimers();
    const { client } = harness(call => call.path === '/v1/device/token' ? failure(code) : undefined);
    await client.startDeviceAuthorization();
    const outcome = expect(client.waitForAuthorization()).rejects.toMatchObject({ code });
    await vi.advanceTimersByTimeAsync(5000); await outcome;
    await expect(client.waitForAuthorization()).rejects.toMatchObject({ code: 'invalid_grant' });
  });
  it('expires locally without a poll at the deadline', async () => {
    vi.useFakeTimers();
    const { client, calls } = harness(call => call.path === '/v1/device/code' ? json(device({ expiresIn: 5 })) : undefined);
    await client.startDeviceAuthorization();
    const outcome = expect(client.waitForAuthorization()).rejects.toMatchObject({ code: 'expired_token' });
    await vi.advanceTimersByTimeAsync(5000); await outcome;
    expect(calls).toHaveLength(1);
  });
  it('allows cancellation while waiting and rejects concurrent polling', async () => {
    vi.useFakeTimers();
    const { client, calls } = harness();
    const abort = new AbortController();
    await client.startDeviceAuthorization();
    const outcome = expect(client.waitForAuthorization({ signal: abort.signal })).rejects.toMatchObject({ code: 'aborted' });
    await expect(client.waitForAuthorization()).rejects.toMatchObject({ code: 'conflict' });
    abort.abort(); await outcome;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toHaveLength(1);
  });
  it('can restart authorization immediately while a prior device poll is waiting', async () => {
    vi.useFakeTimers();
    const { client, calls } = harness();
    await client.startDeviceAuthorization();
    const oldOutcome = expect(client.waitForAuthorization()).rejects.toMatchObject({ code: 'authorization_changed' });
    const replacement = client.authorize({ onUserCode: vi.fn() });
    await vi.advanceTimersByTimeAsync(5000);
    await oldOutcome;
    await expect(replacement).resolves.toMatchObject({ connectionId: 'b'.repeat(32) });
    expect(calls.filter(call => call.path === '/v1/device/token')).toHaveLength(1);
  });
  it('hands an explicit public link to the game without opening a browser', async () => {
    vi.useFakeTimers();
    const onUserCode = vi.fn();
    const { client } = harness();
    const pending = client.authorize({ onUserCode });
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    expect(onUserCode).toHaveBeenCalledOnce();
    expect(onUserCode.mock.calls[0][0].verificationUriComplete).toContain(`?code=${CODE}`);
  });
  it('requires relinking after expiry and never refreshes credentials', async () => {
    const { client, calls } = harness();
    await link(client);
    const expiry = client.authorization!.expiresAt;
    vi.useFakeTimers(); vi.setSystemTime(expiry);
    const before = calls.length;
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(client.authorization).toBeNull(); expect(calls).toHaveLength(before);
    expect(calls.some(call => /refresh/.test(call.url))).toBe(false);
  });
  it('stops using the prior account immediately when another link starts', async () => {
    const { client, calls } = harness();
    await link(client);
    await client.startDeviceAuthorization();
    const before = calls.length;
    expect(client.authorization).toBeNull();
    await expect(client.stageCapture(capture())).rejects.toMatchObject({ code: 'invalid_token' });
    expect(calls).toHaveLength(before);
  });
  it('recovers a transient poll failure without polling faster than five seconds', async () => {
    vi.useFakeTimers();
    let polls = 0;
    const { client } = harness(call => {
      if (call.path !== '/v1/device/token') return;
      if (++polls === 1) throw new Error('offline');
      return json(token());
    });
    await client.startDeviceAuthorization();
    const pending = client.waitForAuthorization();
    await vi.advanceTimersByTimeAsync(5000); expect(polls).toBe(1);
    await vi.advanceTimersByTimeAsync(4999); expect(polls).toBe(1);
    await vi.advanceTimersByTimeAsync(1); await pending; expect(polls).toBe(2);
  });
  it('does not poll again when a retry interval extends beyond the device deadline', async () => {
    vi.useFakeTimers();
    const { client, calls } = harness(call => call.path === '/v1/device/token' ? failure('rate_limited', 429, { retryAfter: 86400 }) : undefined);
    await client.startDeviceAuthorization();
    const outcome = expect(client.waitForAuthorization()).rejects.toMatchObject({ code: 'expired_token' });
    await vi.advanceTimersByTimeAsync(600_000); await outcome;
    expect(calls.filter(call => call.path === '/v1/device/token')).toHaveLength(1);
  });
  it('clears credentials on a 401 even with a malformed error body', async () => {
    const { client } = harness(call => call.path.includes('/captures/') ? new Response('not-json', { status: 401 }) : undefined);
    await link(client);
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'invalid_token' });
    expect(client.authorization).toBeNull();
  });
});

describe('private capture transport', () => {
  it('returns the allocated public ID before upload so explicit cancellation can discard it', async () => {
    const { client, calls } = harness(); await link(client);
    const abort = new AbortController(); let reserved = '';
    await expect(client.stageCapture(capture({ signal: abort.signal, onCaptureReserved: (id: string) => { reserved = id; abort.abort(); } }))).rejects.toMatchObject({ code: 'aborted' });
    expect(reserved).toBe(ID); expect(calls.some(call => call.path.includes('/chunks/') || call.path.endsWith('/finish') || call.init.method === 'DELETE')).toBe(false);
    await client.discardCapture(reserved); expect(calls.at(-1)).toMatchObject({ path: `/v1/captures/${ID}`, init: { method: 'DELETE' } });
  });
  it.each([false, true])('reports readiness only after a confirmed receipt (already ready: %s)', async alreadyReady => {
    const { client } = harness(call => alreadyReady && call.path === '/v1/captures' ? json(receipt({ status: 'ready' })) : undefined);
    await link(client); const phases: string[] = []; const reserved = vi.fn();
    await client.stageCapture(capture({ onCaptureReserved: reserved, onPhase: (phase: string) => phases.push(phase) }));
    expect(reserved).toHaveBeenCalledExactlyOnceWith(ID);
    expect(phases).toEqual(alreadyReady ? ['preparing', 'ready'] : ['preparing', 'uploading', 'verifying', 'ready']);
  });
  it('does not describe fully transferred bytes as ready when final verification fails', async () => {
    const { client } = harness(call => call.path.endsWith('/finish') ? failure('invalid_request', 400) : undefined);
    await link(client); const phases: string[] = []; const progress = vi.fn();
    await expect(client.stageCapture(capture({ onPhase: (phase: string) => phases.push(phase), onProgress: progress }))).rejects.toMatchObject({ code: 'invalid_request' });
    expect(progress).toHaveBeenCalledWith(1); expect(phases).toEqual(['preparing', 'uploading', 'verifying']);
  });
  it('stops before uploading if the reservation callback starts a new account link', async () => {
    const { client, calls } = harness(); await link(client); let replacement: Promise<unknown> | undefined;
    await expect(client.stageCapture(capture({ onCaptureReserved: () => { replacement = client.startDeviceAuthorization(); } }))).rejects.toMatchObject({ code: 'authorization_changed' });
    await replacement; expect(calls.some(call => call.path.includes('/chunks/') || call.path.endsWith('/finish'))).toBe(false);
  });
  it('uploads exact chunks and checksums, reports progress, and returns only a safe review link', async () => {
    const media = new Uint8Array(PARTNER_CHUNK_BYTES + 19).fill(6);
    const onProgress = vi.fn();
    const { client, calls } = harness();
    await link(client);
    const result = await client.stageCapture(capture({ media, onProgress }));
    const create = calls.find(call => call.path === '/v1/captures')!;
    expect(JSON.parse(String(create.init.body))).toMatchObject({ byteSize: media.length, contentSha256: hash(media), idempotencyKey: 'capture_123' });
    expect(JSON.parse(String(create.init.body))).not.toHaveProperty('gameId');
    const chunks = calls.filter(call => call.path.includes('/chunks/'));
    expect(chunks.map(call => (call.init.body as ArrayBuffer).byteLength)).toEqual([PARTNER_CHUNK_BYTES, 19]);
    for (const call of chunks) expect(new Headers(call.init.headers).get('X-Chunk-SHA256')).toBe(hash(new Uint8Array(call.init.body as ArrayBuffer)));
    expect(onProgress.mock.calls.map(call => call[0])).toEqual([0, PARTNER_CHUNK_BYTES / media.length, 1]);
    expect(result).toMatchObject({ status: 'ready', reviewUrl: `https://vybehub.app/game-capture/${ID}` });
    expect(result).not.toHaveProperty('storagePath');
    expect(calls.some(call => /publish|Firebase|firebasestorage/.test(call.url))).toBe(false);
  });
  it('accepts the 48 MiB limit as exactly six immutable chunks', async () => {
    const { client, calls } = harness(); await link(client);
    const media = new Uint8Array(48 * 1024 * 1024);
    await client.stageCapture(capture({ media }));
    const chunks = calls.filter(call => call.path.includes('/chunks/'));
    expect(chunks).toHaveLength(6);
    expect(chunks.every(call => (call.init.body as ArrayBuffer).byteLength === PARTNER_CHUNK_BYTES)).toBe(true);
  });
  it('snapshots caller bytes and metadata before hashing and retries identical requests after response loss', async () => {
    let createAttempts = 0, chunkAttempts = 0, finishAttempts = 0;
    const media = new Uint8Array(12).fill(7);
    const tags = ['original'];
    const { client, calls } = harness(call => {
      if (call.path === '/v1/captures' && ++createAttempts === 1) throw new Error(`network ${TOKEN}`);
      if (call.path.includes('/chunks/') && ++chunkAttempts === 1) throw new Error('lost chunk acknowledgement');
      if (call.path.endsWith('/finish') && ++finishAttempts === 1) return failure('unavailable', 503);
    });
    await link(client);
    const pending = client.stageCapture(capture({ media, tags }));
    media.fill(9); tags[0] = 'changed';
    const result = await pending;
    expect(result.status).toBe('ready');
    for (const path of ['/v1/captures', `/v1/captures/${ID}/chunks/0`, `/v1/captures/${ID}/finish`]) {
      const requests = calls.filter(call => call.path === path);
      expect(requests).toHaveLength(2);
      expect(requests[0].init.body).toEqual(requests[1].init.body);
    }
    const createBody = JSON.parse(String(calls.find(call => call.path === '/v1/captures')!.init.body));
    expect(createBody).toMatchObject({ tags: ['original'], contentSha256: hash(new Uint8Array(12).fill(7)) });
  });
  it('binds the same idempotency key to the whole-file hash across retries', async () => {
    let firstHash: string | undefined;
    const { client, calls } = harness(call => {
      if (call.path !== '/v1/captures') return;
      const body = JSON.parse(String(call.init.body));
      if (firstHash && firstHash !== body.contentSha256) return failure('conflict', 409);
      firstHash = body.contentSha256;
      return json(receipt({ status: 'ready' }));
    });
    await link(client);
    await client.stageCapture(capture());
    await client.stageCapture(capture());
    await expect(client.stageCapture(capture({ media: new Uint8Array(12).fill(8) }))).rejects.toMatchObject({ code: 'conflict', status: 409 });
    expect(calls.filter(call => call.path === '/v1/captures')).toHaveLength(3);
    expect(calls.some(call => call.path.includes('/chunks/'))).toBe(false);
  });
  it.each(['sha256', 'index', 'byteSize'])('rejects mismatched chunk acknowledgement %s before finishing', async field => {
    const { client, calls } = harness(call => call.path.includes('/chunks/') ? json({ index: 0, byteSize: 12, sha256: hash(new Uint8Array(12).fill(7)), [field]: 'wrong' }) : undefined);
    await link(client);
    await expect(client.stageCapture(capture())).rejects.toMatchObject({ code: 'invalid_response' });
    expect(calls.some(call => call.path.endsWith('/finish'))).toBe(false);
  });
  it('rejects a receipt belonging to a different game', async () => {
    const { client } = harness(call => call.path.includes('/captures/') ? json(receipt({ gameId: 'another-game' })) : undefined);
    await link(client);
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('does not treat unfinished or mismatched final receipts as upload success', async () => {
    for (const extra of [{ status: 'uploading' }, { captureId: 'c'.repeat(48) }, { byteSize: 100 }]) {
      const { client } = harness(call => call.path.endsWith('/finish') ? json(receipt(extra)) : undefined);
      await link(client);
      await expect(client.stageCapture(capture())).rejects.toMatchObject({ code: 'invalid_response' });
    }
  });
  it.each([
    ['invalid_token', 401], ['access_denied', 403], ['insufficient_scope', 403], ['not_found', 404],
    ['conflict', 409], ['expired_capture', 410], ['payload_too_large', 413],
  ])('returns %s without automatic retries', async (code, status) => {
    const { client, calls } = harness(call => call.path.includes('/captures/') ? failure(String(code), Number(status)) : undefined);
    await link(client);
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code, status });
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
    if (status === 401) expect(client.authorization).toBeNull();
  });
  it('honors capture rate limits and permits abort during retry backoff', async () => {
    const { client, calls } = harness(call => call.path.includes('/captures/') ? failure('rate_limited', 429, { retryAfter: 10 }) : undefined);
    await link(client); vi.useFakeTimers();
    const abort = new AbortController();
    const outcome = expect(client.getCapture(ID, { signal: abort.signal })).rejects.toMatchObject({ code: 'aborted' });
    await vi.advanceTimersByTimeAsync(9999);
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
    abort.abort(); await outcome;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
  });
  it('preserves daily backoff metadata and returns without short automatic retries', async () => {
    const { client, calls } = harness(call => call.path.includes('/captures/') ? failure('rate_limited', 429, { retryAfter: 86400 }) : undefined);
    await link(client); vi.useFakeTimers();
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'rate_limited', status: 429, retryAfter: 86400 });
    await vi.advanceTimersByTimeAsync(180_000);
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
  });
  it.each([
    ['120', 2, 120], ['20', 180, 180], ['999999999999999999999999999999999999', undefined, 86400],
    ['not-a-date', 121, 121], ['-10', 122, 122],
  ])('respects the longer header/body cooldown (%s)', async (header, body, expected) => {
    const { client, calls } = harness(call => call.path.includes('/captures/')
      ? new Response(JSON.stringify({ error: 'rate_limited', retryAfter: body }), { status: 429, headers: { 'Retry-After': header } }) : undefined);
    await link(client);
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'rate_limited', retryAfter: expected });
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
  });
  it.each([429, 503])('preserves header cooldown on a non-JSON %s gateway failure', async status => {
    const { client, calls } = harness(call => call.path.includes('/captures/')
      ? new Response('<html>upstream unavailable SECRET</html>', { status, headers: { 'Retry-After': '180' } }) : undefined);
    await link(client);
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code: status === 429 ? 'rate_limited' : 'unavailable', retryAfter: 180 });
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
  });
  it('uses HTTP-date cooldowns without retrying before the given time', async () => {
    let reads = 0;
    const { client, calls } = harness(call => {
      if (call.path.includes('/captures/') && ++reads === 1) return new Response('{}', { status: 429,
        headers: { 'Retry-After': new Date(Date.now() + 20_000).toUTCString() } });
    });
    await link(client); vi.useFakeTimers(); vi.setSystemTime(Math.floor(Date.now() / 1000) * 1000);
    const result = client.getCapture(ID);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); await expect(result).resolves.toMatchObject({ captureId: ID });
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(2);
  });
  it('stops link polling at expiry when a gateway requests a longer header cooldown', async () => {
    const { client, calls } = harness(call => call.path === '/v1/device/token'
      ? new Response('unavailable', { status: 503, headers: { 'Retry-After': '86400' } }) : undefined);
    vi.useFakeTimers(); await client.startDeviceAuthorization();
    const outcome = expect(client.waitForAuthorization()).rejects.toMatchObject({ code: 'expired_token' });
    await vi.advanceTimersByTimeAsync(600_000); await outcome;
    expect(calls.filter(call => call.path === '/v1/device/token')).toHaveLength(1);
  });
  it('does not retry an upload after its credential expires during backoff', async () => {
    const { client, calls } = harness(call => {
      if (call.path === '/v1/device/token') return json(token({ expiresIn: 6, expiresAt: Date.now() + 6000 }));
      if (call.path.includes('/captures/')) return failure('rate_limited', 429, { retryAfter: 20 });
    });
    await link(client); vi.useFakeTimers();
    const outcome = expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'invalid_token' });
    await vi.advanceTimersByTimeAsync(20_000); await outcome;
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(1);
    expect(client.authorization).toBeNull();
  });
  it('times out hung requests and caps retries', async () => {
    const { client, calls } = harness(call => call.path.includes('/captures/') ? new Promise<Response>((_, reject) => {
      call.init.signal!.addEventListener('abort', () => reject(new Error('network timeout')));
    }) : undefined);
    await link(client); vi.useFakeTimers();
    const outcome = expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'network_error' });
    await vi.advanceTimersByTimeAsync(91_000); await outcome;
    expect(calls.filter(call => call.path.includes('/captures/'))).toHaveLength(3);
  });
  it('supports Blob capture media', async () => {
    const { client } = harness();
    await link(client);
    await expect(client.stageCapture(capture({ media: new Blob([new Uint8Array(12)], { type: 'image/png' }) }))).resolves.toMatchObject({ status: 'ready' });
  });
  it('rejects invalid media and metadata before any network write', async () => {
    const { client, calls } = harness(); await link(client);
    const before = calls.length;
    for (const extra of [{ media: new Uint8Array(11) }, { media: new Uint8Array(48 * 1024 * 1024 + 1) }, { contentType: 'text/html' }, { idempotencyKey: 'short' }, { caption: 'x'.repeat(2201) }, { tags: ['x'.repeat(41)] }]) {
      await expect(client.stageCapture(capture(extra))).rejects.toMatchObject({ code: 'invalid_request' });
    }
    expect(calls).toHaveLength(before);
  });
  it('cancels before upload, and cancellation after a chunk does not publish or silently discard', async () => {
    const { client, calls } = harness(); await link(client);
    const preAborted = new AbortController(); preAborted.abort();
    await expect(client.stageCapture(capture({ signal: preAborted.signal }))).rejects.toMatchObject({ code: 'aborted' });
    const abort = new AbortController();
    await expect(client.stageCapture(capture({ signal: abort.signal, onProgress: (fraction: number) => { if (fraction > 0) abort.abort(); } }))).rejects.toMatchObject({ code: 'aborted' });
    expect(calls.some(call => call.path.endsWith('/finish') || call.init.method === 'DELETE')).toBe(false);
  });
  it('forwards cancellation to an in-flight network request', async () => {
    let inFlight!: () => void;
    const started = new Promise<void>(resolve => { inFlight = resolve; });
    const { client } = harness(call => call.path.includes('/captures/') ? new Promise<Response>((_, reject) => {
      call.init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      inFlight();
    }) : undefined);
    await link(client);
    const abort = new AbortController();
    const outcome = expect(client.getCapture(ID, { signal: abort.signal })).rejects.toMatchObject({ code: 'aborted' });
    await started; abort.abort(); await outcome;
  });
  it('does not continue an old capture under a newly linked account', async () => {
    let resolveChunk!: (value: Response) => void, started!: () => void;
    const inFlight = new Promise<void>(resolve => { started = resolve; });
    let nextToken = false;
    const { client, calls } = harness(call => {
      if (call.path === '/v1/device/token' && nextToken) return json(token({ accessToken: `vyp_${'n'.repeat(43)}`, connectionId: 'c'.repeat(32) }));
      if (call.path.includes('/chunks/')) return new Promise<Response>(resolve => { resolveChunk = resolve; started(); });
    });
    await link(client);
    const outcome = expect(client.stageCapture(capture())).rejects.toMatchObject({ code: 'authorization_changed' });
    await inFlight;
    nextToken = true; await link(client);
    resolveChunk(json({ index: 0, byteSize: 12, sha256: hash(new Uint8Array(12).fill(7)) }));
    await outcome;
    expect(calls.some(call => call.path.endsWith('/finish'))).toBe(false);
  });
  it('supports status, explicit private discard and self-revocation', async () => {
    const { client, calls } = harness(); await link(client);
    await expect(client.getCapture(ID)).resolves.toMatchObject({ captureId: ID });
    await client.discardCapture(ID);
    await client.revokeConnection();
    expect(client.authorization).toBeNull();
    expect(calls.some(call => call.path === `/v1/captures/${ID}` && call.init.method === 'DELETE')).toBe(true);
    await expect(client.getCapture(ID)).rejects.toMatchObject({ code: 'invalid_token' });
  });
  it('clears local credentials even when revocation response is lost', async () => {
    const { client, calls } = harness(call => call.path === '/v1/connection/revoke' ? failure('unavailable', 503) : undefined);
    await link(client);
    await expect(client.revokeConnection()).rejects.toMatchObject({ code: 'unavailable' });
    expect(client.authorization).toBeNull();
    expect(calls.filter(call => call.path === '/v1/connection/revoke')).toHaveLength(3);
  });
  it('sanitizes receipt links and drops private server fields', async () => {
    const { client } = harness(call => call.path.includes('/captures/') ? json(receipt({ reviewUrl: `https://evil.example/?token=${TOKEN}`, storagePath: 'private/owner-uid/file', ownerId: 'owner-uid' })) : undefined);
    await link(client);
    const result = await client.getCapture(ID);
    expect(result.reviewUrl).toBe(`https://vybehub.app/game-capture/${ID}`);
    expect(JSON.stringify(result)).not.toMatch(/evil|owner-uid|storagePath|vyp_/);
    expect(() => client.getReviewUrl({ captureId: '../?access_token=secret' })).toThrow();
  });
});
