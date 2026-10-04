// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VybePartnerClient } from '../../sdk/game/http';
import { parsePublicFeed } from '../../sdk/game/publicFeed';
const connectionId = 'c'.repeat(32);
const post = () => ({ id: 'post-1', type: 'post', caption: 'Hello from VYBE', createdAt: '2026-10-04T00:00:00.000Z', mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'safe', likeCount: 1, commentCount: 0, viewCount: 2, tags: [], author: { id: 'author-1', username: 'creator', displayName: null, avatarUrl: null } });
const page = () => ({ connectionId, expiresAt: Date.now() + 590000, contentType: null, nextCursor: null, posts: [post()] });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function linked(options: { enabled?: boolean; preview?: boolean; scopes?: string[]; handler?: (url: string) => Response | Promise<Response> } = {}) {
  const scopes = options.scopes ?? ['capture:write', 'capture:status', ...(options.preview ? ['capture:preview'] : []), ...(options.enabled === false ? [] : ['feed:read_public'])];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/device/code')) return json({ deviceCode: `vyd_${'d'.repeat(43)}`, userCode: 'ABCD-2345', verificationUri: 'https://vybehub.app/connect/game', expiresIn: 600, interval: 5 });
    if (url.endsWith('/device/token')) return json({ accessToken: `vyp_${'t'.repeat(43)}`, tokenType: 'Bearer', connectionId, expiresIn: 600, expiresAt: Date.now() + 600000, scopes });
    return options.handler?.(url) ?? json(page());
  });
  const client = new VybePartnerClient({ clientId: 'feed-mod', apiBaseUrl: 'https://example.test/api', browsePublicFeed: options.enabled !== false, previewCaptures: options.preview, fetch: fetcher });
  vi.useFakeTimers(); await client.startDeviceAuthorization(); const pending = client.waitForAuthorization(); pending.catch(() => {}); await vi.advanceTimersByTimeAsync(5000); await pending; vi.useRealTimers();
  return { client, fetcher };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('partner public feed SDK', () => {
  it('requires opt-in and exact granted scopes', async () => {
    const h = await linked({ preview: true });
    expect(JSON.parse(String(h.fetcher.mock.calls[0][1]?.body)).scopes).toEqual(['capture:write', 'capture:status', 'capture:preview', 'feed:read_public']);
    const old = await linked({ enabled: false }); await expect(old.client.browsePublicFeed()).rejects.toMatchObject({ code: 'insufficient_scope' }); expect(old.fetcher).toHaveBeenCalledTimes(2);
    await expect(linked({ scopes: ['capture:write', 'capture:status'] })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('returns metadata without media requests and binds the selected filter', async () => {
    const h = await linked({ handler: url => { expect(url).toContain('cursor=' + 'a'.repeat(48)); return json({ ...page(), contentType: 'post' }); } });
    expect((await h.client.browsePublicFeed({ cursor: 'a'.repeat(48), contentType: 'post' })).posts[0].caption).toBe('Hello from VYBE');
    expect(h.fetcher).toHaveBeenCalledTimes(3); expect(h.fetcher.mock.calls.at(-1)?.[1]).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
    await expect(h.client.browsePublicFeed({ cursor: 'bad' })).rejects.toMatchObject({ code: 'invalid_request' });
  });
  it('rejects private fields, unsafe media, duplicates, expired or foreign receipts', () => {
    const invalid = [
      { ...page(), connectionId: 'd'.repeat(32) }, { ...page(), expiresAt: 1 },
      { ...page(), ownerUid: 'private' }, { ...page(), posts: [{ ...post(), isBookmarked: true }] },
      { ...page(), posts: [{ ...post(), ageRating: '18+' }] },
      { ...page(), posts: [{ ...post(), mediaUrl: 'http://example.test/image.png' }] },
      { ...page(), posts: [post(), post()] },
      { ...page(), posts: [{ ...post(), author: { ...post().author, ownerUid: 'private' } }] },
    ];
    for (const value of invalid) expect(() => parsePublicFeed(value, { connectionId, expiresAt: Date.now() + 600000 }, {})).toThrow();
  });
  it('bounds streams and cancels stalled bodies', async () => {
    const cancel = vi.fn(); const h = await linked({ handler: () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); }, cancel })) });
    await expect(h.client.browsePublicFeed()).rejects.toMatchObject({ code: 'invalid_response' }); expect(cancel).toHaveBeenCalled();
    const controller = new AbortController(); const stalled = await linked({ handler: () => new Response(new ReadableStream({ cancel })) });
    const pending = stalled.client.browsePublicFeed({ signal: controller.signal }); await new Promise(r => setTimeout(r, 0)); controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
  });
  it('rejects late results after account changes and forgets revoked tokens', async () => {
    let finish!: () => void;
    const h = await linked({ handler: () => new Promise(resolve => { finish = () => resolve(json(page())); }) });
    const pending = h.client.browsePublicFeed(); await new Promise(r => setTimeout(r, 0)); h.client.clearLocalAuthorization(); finish();
    await expect(pending).rejects.toMatchObject({ code: 'authorization_changed' });
    const revoked = await linked({ handler: () => json({ error: 'invalid_token' }, 401) });
    await expect(revoked.client.browsePublicFeed()).rejects.toMatchObject({ code: 'invalid_token' }); expect(revoked.client.authorization).toBeNull();
  });
  it('preserves feed-changed recovery without retrying or reflecting server messages', async () => {
    const h = await linked({ handler: () => json({ error: 'feed_changed', message: 'untrusted detail' }, 409) });
    await expect(h.client.browsePublicFeed()).rejects.toMatchObject({ code: 'feed_changed', message: 'The feed changed. Clear this page and start browsing again.' }); expect(h.fetcher).toHaveBeenCalledTimes(3);
  });
});

it('caps subsecond server expiry rounding at the local token deadline', () => {
  const expiresAt = Date.now() + 500000;
  const value = { ...page(), expiresAt: expiresAt + 999 };
  expect(parsePublicFeed(value, { connectionId, expiresAt }, {}).expiresAt).toBe(expiresAt);
  expect(() => parsePublicFeed({ ...value, expiresAt: expiresAt + 1001 }, { connectionId, expiresAt }, {})).toThrow();
});
