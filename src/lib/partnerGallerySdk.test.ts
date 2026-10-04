// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VybePartnerClient } from '../../sdk/game/http';

const id = 'a'.repeat(48), token = `vyp_${'t'.repeat(43)}`;
const receipt = { captureId: id, status: 'ready', gameId: 'test-mod', gameName: 'Test Mod', contentType: 'image/png', byteSize: 12, caption: '<script>text</script>', tags: [], expiresAt: Date.now() + 600000, postId: null };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const mediaHeaders = { 'Content-Type': 'image/png', 'Content-Length': '12', 'Content-Range': 'bytes 0-11/12', 'X-Capture-SHA256': 'f'.repeat(64) };
async function linked(options: { preview?: boolean; handler?: (url: string, init: RequestInit) => Response | Promise<Response>; scopes?: string[]; capture?: typeof receipt } = {}) {
  const scopes = options.scopes ?? ['capture:write', 'capture:status', ...(options.preview === false ? [] : ['capture:preview'])];
  const fetcher = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    if (String(url).endsWith('/device/code')) return json({ deviceCode: `vyd_${'d'.repeat(43)}`, userCode: 'ABCD-2345', verificationUri: 'https://vybehub.app/connect/game', expiresIn: 600, interval: 5 });
    if (String(url).endsWith('/device/token')) return json({ accessToken: token, tokenType: 'Bearer', connectionId: 'c'.repeat(32), expiresIn: 600, expiresAt: Date.now() + 600000, scopes });
    if (String(url).endsWith(`/v1/captures/${id}`)) return json(options.capture ?? receipt);
    return options.handler?.(String(url), init) ?? json({ captures: [receipt], nextCursor: null });
  });
  const client = new VybePartnerClient({ clientId: 'test-mod', apiBaseUrl: 'https://example.test/api', previewCaptures: options.preview !== false, fetch: fetcher });
  vi.useFakeTimers(); await client.startDeviceAuthorization(); const pending = client.waitForAuthorization(); pending.catch(() => {}); await vi.advanceTimersByTimeAsync(5000); await pending; vi.useRealTimers();
  return { client, fetcher };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('connection-owned gallery SDK', () => {
  it('assembles bounded ordered chunks and rejects a changed whole-file identity', async () => {
    const size = 8 * 1024 * 1024 + 12;
    for (const changed of [false, true]) {
      const h = await linked({ capture: { ...receipt, byteSize: size }, handler: url => {
        const index = Number(new URL(url).searchParams.get('chunk')), offset = index * 8 * 1024 * 1024, length = Math.min(size - offset, 8 * 1024 * 1024);
        return new Response(new Uint8Array(length).fill(index + 1), { headers: { ...mediaHeaders, 'Content-Length': String(length), 'Content-Range': `bytes ${offset}-${offset + length - 1}/${size}`, 'X-Capture-SHA256': changed && index ? 'e'.repeat(64) : 'f'.repeat(64) } });
      } });
      if (changed) await expect(h.client.getCapturePreview(id)).rejects.toMatchObject({ code: 'invalid_response' });
      else { const blob = await h.client.getCapturePreview(id); expect(blob.size).toBe(size); expect(new Uint8Array(await blob.slice(-12).arrayBuffer())).toEqual(new Uint8Array(12).fill(2)); }
    }
  });
  it('requests preview only when configured, and requires an exact granted scope set', async () => {
    const a = await linked(); expect(JSON.parse(String(a.fetcher.mock.calls[0][1]?.body)).scopes).toContain('capture:preview');
    const b = await linked({ preview: false }); expect(JSON.parse(String(b.fetcher.mock.calls[0][1]?.body))).not.toHaveProperty('scopes');
    await expect(b.client.getCapturePreview(id)).rejects.toMatchObject({ code: 'insufficient_scope' });
    await expect(linked({ scopes: ['capture:write', 'capture:status'] })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('uses header authorization with no cookies, referrer or external media URLs', async () => {
    const h = await linked({ handler: () => new Response(new Uint8Array(12), { headers: mediaHeaders }) });
    const blob = await h.client.getCapturePreview(id); expect(blob.type).toBe('image/png'); expect(blob.size).toBe(12);
    const [url, init] = h.fetcher.mock.calls.at(-1)!;
    expect(String(url)).toBe(`https://example.test/api/v1/captures/${id}/preview?chunk=0`);
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Authorization: `Bearer ${token}` } });
  });
  it.each([
    { type: 'text/html', length: '12', size: 12 },
    { type: 'image/png', length: '13', size: 12 },
    { type: 'image/png', length: '12', size: 13 },
    { type: 'image/png', length: '50331649', size: 12 },
  ])('rejects unsafe media response %j', async value => {
    const h = await linked({ handler: () => new Response(new Uint8Array(value.size), { headers: { ...mediaHeaders, 'Content-Type': value.type, 'Content-Length': value.length } }) });
    await expect(h.client.getCapturePreview(id)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('paginates only validated IDs and rejects non-progressing cursors', async () => {
    const h = await linked(); expect((await h.client.listCaptures()).captures[0].caption).toBe(receipt.caption);
    await expect(h.client.listCaptures({ cursor: 'not/a/cursor' })).rejects.toMatchObject({ code: 'invalid_request' });
    const bad = await linked({ handler: () => json({ captures: [], nextCursor: id }) });
    await expect(bad.client.listCaptures({ cursor: id })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects duplicate, out-of-order or foreign capture lists', async () => {
    for (const captures of [[receipt, receipt], [{ ...receipt, gameId: 'foreign' }], Array(21).fill(receipt)]) {
      const h = await linked({ handler: () => json({ captures, nextCursor: null }) });
      await expect(h.client.listCaptures()).rejects.toMatchObject({ code: 'invalid_response' });
    }
  });
  it('cancels an oversized streaming gallery response without buffering it', async () => {
    const cancel = vi.fn(); const h = await linked({ handler: () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(262145)); }, cancel })) });
    await expect(h.client.listCaptures()).rejects.toMatchObject({ code: 'invalid_response' }); expect(cancel).toHaveBeenCalled();
  });
  it('cancels a stalled body and rejects a late body after a local account change', async () => {
    const cancel = vi.fn(); const h = await linked({ handler: () => new Response(new ReadableStream({ cancel }), { headers: mediaHeaders }) });
    const abort = new AbortController(); const pending = h.client.getCapturePreview(id, { signal: abort.signal });
    await new Promise(resolve => setTimeout(resolve, 0)); abort.abort(); await expect(pending).rejects.toMatchObject({ code: 'aborted' }); expect(cancel).toHaveBeenCalled();
    let release!: ReadableStreamDefaultController<Uint8Array>;
    const changed = await linked({ handler: () => new Response(new ReadableStream({ start(controller) { release = controller; } }), { headers: mediaHeaders }) });
    const stale = changed.client.getCapturePreview(id); await new Promise(resolve => setTimeout(resolve, 0)); changed.client.clearLocalAuthorization(); release.enqueue(new Uint8Array(12)); release.close();
    await expect(stale).rejects.toMatchObject({ code: 'authorization_changed' });
  });
  it('requires acknowledged preview access checks and clears rejected credentials', async () => {
    const ok = await linked({ handler: () => new Response(null, { status: 204 }) }); await ok.client.checkCapturePreview(id);
    expect(ok.fetcher.mock.calls.at(-1)?.[1]?.method).toBe('HEAD');
    const denied = await linked({ handler: () => new Response(null, { status: 401 }) });
    await expect(denied.client.checkCapturePreview(id)).rejects.toMatchObject({ code: 'invalid_token' }); expect(denied.client.authorization).toBeNull();
  });
});
