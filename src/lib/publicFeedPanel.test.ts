import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPublicFeed } from '../../sdk/universal/feed';
import type { PublicFeedPage, PublicFeedOptions } from '../../sdk/game/http';
const post = { id: 'post-1', type: 'post' as const, caption: '<b>A public moment</b>', createdAt: '2026-10-04T00:00:00.000Z', mediaUrl: 'https://media.example/moment.png', mediaUrls: [], thumbnailUrl: null, ageRating: 'safe' as const, likeCount: 0, commentCount: 0, viewCount: 0, tags: [], author: { id: 'author', username: 'creator', displayName: null, avatarUrl: null } };
let dispose = () => {};
const flush = () => vi.advanceTimersByTimeAsync(1);
function harness() {
  const target = document.createElement('div'); document.body.append(target);
  const page: PublicFeedPage = { connectionId: 'a'.repeat(32), expiresAt: Date.now() + 600000, contentType: null, nextCursor: null, posts: [post] };
  const client = { authorization: { connectionId: page.connectionId, expiresAt: page.expiresAt, scopes: ['feed:read_public'] }, browsePublicFeed: vi.fn(async (_options?: PublicFeedOptions) => page) };
  const panel = mountPublicFeed(target, client); dispose = panel.dispose;
  const root = target.shadowRoot!;
  const button = (label: string) => [...root.querySelectorAll('button')].find(button => button.textContent === label)!;
  return { root, client, panel, page, button };
}
beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); });
afterEach(() => { dispose(); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('public feed host panel', () => {
  it('loads only on request, renders text safely and selects media explicitly', async () => {
    const h = harness(); expect(h.client.browsePublicFeed).not.toHaveBeenCalled();
    h.button('Explore moments').click(); await flush();
    expect(h.root.textContent).toContain(post.caption); expect(h.root.querySelector('b,img,video')).toBeNull();
    h.button('View media').click(); expect(h.root.querySelector('img')?.src).toBe(post.mediaUrl);
    expect(h.root.querySelector('img')?.referrerPolicy).toBe('no-referrer');
    h.button('Close media').click(); expect(h.root.querySelector('img')).toBeNull();
  });
  it('replaces pages, preserves cursor selection for checks and resets on filter change', async () => {
    const h = harness(); h.page.nextCursor = 'b'.repeat(48);
    h.button('Explore moments').click(); await flush(); h.button('Next page').click(); await flush();
    expect(h.client.browsePublicFeed.mock.calls.at(-1)?.[0]).toMatchObject({ cursor: 'b'.repeat(48) });
    expect(h.root.querySelectorAll('li')).toHaveLength(1);
    const select = h.root.querySelector('select')!; select.value = 'video'; select.dispatchEvent(new Event('change')); await flush();
    expect(h.client.browsePublicFeed.mock.calls.at(-1)?.[0]).toMatchObject({ cursor: undefined, contentType: 'video' });
  });
  it('aborts and rejects late delivery after closing', async () => {
    const h = harness(); let finish!: (page: PublicFeedPage) => void;
    h.client.browsePublicFeed.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    h.button('Explore moments').click(); h.button('Cancel').click(); finish(h.page); await flush();
    expect(h.root.querySelector('li')).toBeNull(); expect(h.button('Explore moments').disabled).toBe(false);
  });
  it('clears content and media after account change or hidden document', async () => {
    const h = harness(); h.button('Explore moments').click(); await flush(); h.button('View media').click();
    h.client.authorization.connectionId = 'changed'; await vi.advanceTimersByTimeAsync(1000);
    expect(h.root.querySelector('li,img')).toBeNull();
    h.client.authorization.connectionId = h.page.connectionId; h.button('Explore moments').click(); await flush();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
    expect(h.root.querySelector('li')).toBeNull();
  });
  it('clears a remotely removed post on periodic revalidation and fails closed on errors', async () => {
    const h = harness(); h.button('Explore moments').click(); await flush(); h.button('View media').click();
    h.client.browsePublicFeed.mockResolvedValueOnce({ ...h.page, posts: [] }); await vi.advanceTimersByTimeAsync(30000);
    expect(h.root.querySelector('li,img')).toBeNull();
    h.client.browsePublicFeed.mockRejectedValueOnce(new Error('untrusted details')); await vi.advanceTimersByTimeAsync(30000);
    expect(h.root.textContent).toContain('access could not be checked'); expect(h.root.textContent).not.toContain('untrusted details');
  });
  it('stops checks after disposal and refuses capture-only access', async () => {
    const h = harness(); h.client.authorization.scopes = ['capture:write']; h.button('Explore moments').click(); await flush();
    expect(h.client.browsePublicFeed).not.toHaveBeenCalled(); h.panel.dispose(); await vi.advanceTimersByTimeAsync(60000);
    expect(h.root.childNodes).toHaveLength(0); expect(h.client.browsePublicFeed).not.toHaveBeenCalled();
  });
});
