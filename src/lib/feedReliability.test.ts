import { afterEach, describe, expect, it, vi } from 'vitest';
import { flattenUniqueFeedPosts, hasMoreFeedRows, readFeedPreference, readFeedResult, shouldHandleFeedShortcut, toFeedError, writeFeedPreference } from './feedReliability';

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

describe('feed read results', () => {
  it('preserves a genuinely empty successful response', async () => {
    expect(await readFeedResult(async () => [])).toEqual({ data: [], error: null });
  });
  it('does not disguise permission denial as an empty feed', async () => {
    const result = await readFeedResult(async () => { throw { message: 'Denied', code: 'permission-denied' }; });
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({ message: 'Denied', code: 'permission-denied' });
  });
  it('retains an existing network error', async () => {
    const error = new Error('Offline');
    expect((await readFeedResult(async () => { throw error; })).error).toBe(error);
  });
  it('normalizes adapter errors without losing their code', () => {
    expect(toFeedError({ message: 'Sign in', name: 'unauthenticated' })).toMatchObject({ code: 'unauthenticated' });
    expect(toFeedError(undefined)).toBeInstanceOf(Error);
  });
});

describe('feed pagination and ordering', () => {
  it('uses raw page size even if local filters remove every visible post', () => {
    expect(hasMoreFeedRows(Array(15).fill({ author_id: 'blocked' }), 15)).toBe(true);
    expect(hasMoreFeedRows(Array(14).fill({}), 15)).toBe(false);
  });
  it('does not paginate malformed data or invalid sizes', () => {
    expect(hasMoreFeedRows(null, 15)).toBe(false);
    expect(hasMoreFeedRows([], 0)).toBe(false);
    expect(hasMoreFeedRows([{}], Number.NaN)).toBe(false);
  });
  it('keeps previously loaded clips in place when another page arrives', () => {
    const first = { posts: [{ id: 'ranked-3' }, { id: 'ranked-1' }] };
    const second = { posts: [{ id: 'ranked-1' }, { id: 'ranked-2' }] };
    const initial = flattenUniqueFeedPosts([first]);
    const next = flattenUniqueFeedPosts([first, second]);
    expect(next.slice(0, initial.length)).toEqual(initial);
    expect(next.map(post => post.id)).toEqual(['ranked-3', 'ranked-1', 'ranked-2']);
    expect(first.posts.map(post => post.id)).toEqual(['ranked-3', 'ranked-1']);
  });
  it('deduplicates within pages and tolerates an absent feed', () => {
    expect(flattenUniqueFeedPosts()).toEqual([]);
    expect(flattenUniqueFeedPosts([{ posts: [{ id: 'a' }, { id: '' }, { id: 'a' }] }])).toEqual([{ id: 'a' }]);
  });
});

function keyEvent(target: Element, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}

describe('clip keyboard shortcuts', () => {
  it.each(['input', 'textarea', 'select'])('does not intercept typing in %s', tag => {
    expect(shouldHandleFeedShortcut(keyEvent(document.createElement(tag)))).toBe(false);
  });
  it('does not intercept a nested rich-text editor or dialog', () => {
    const editor = document.createElement('div'); editor.contentEditable = 'true';
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span'); editor.append(child);
    expect(shouldHandleFeedShortcut(keyEvent(child))).toBe(false);
    editor.removeAttribute('contenteditable'); editor.setAttribute('role', 'dialog');
    expect(shouldHandleFeedShortcut(keyEvent(child))).toBe(false);
  });
  it.each(['ctrlKey', 'altKey', 'metaKey', 'shiftKey', 'isComposing'])('respects %s', modifier => {
    expect(shouldHandleFeedShortcut(keyEvent(document.createElement('div'), { [modifier]: true }))).toBe(false);
  });
  it('respects a handled event and permits normal feed navigation', () => {
    const event = keyEvent(document.createElement('div'));
    expect(shouldHandleFeedShortcut(event)).toBe(true);
    event.preventDefault();
    expect(shouldHandleFeedShortcut(event)).toBe(false);
  });
});

describe('storage-restricted playback', () => {
  it('loads with defaults when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(readFeedPreference('vybe-clips-muted')).toBeNull();
  });
  it('keeps mute toggles usable when preferences cannot be saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(() => writeFeedPreference('vybe-clips-muted', 'true')).not.toThrow();
  });
});
