import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ ready: true, aliases: new Set<string>(), isError: false, error: null as Error | null, refetch: vi.fn(), uid: 'alice' }));
vi.mock('@/hooks/useFeedMutes', () => ({ useFeedMutes: () => ({ ...state, isFetching: !state.ready, key: ['feed-mutes', state.uid] }) }));
import { useFeedMuteFilter } from './useFeedMuteFilter';

beforeEach(() => { state.ready = true; state.aliases = new Set(); state.isError = false; state.error = null; state.refetch.mockReset().mockResolvedValue({}); });
const first = { id: 'muted-post', author: { id: 'bob-profile' } }; const other = { id: 'other-post', author: { id: 'other' } };
const makeQuery = () => ({ data: { pages: [{ posts: [first, other], nextPage: 3 }], pageParams: [2] }, isPending: false, isLoading: false, isError: false, isFetching: false, refetch: vi.fn().mockResolvedValue({}) });

describe('mute filters on cached feed observers', () => {
  it('hides immediately after mute and restores cached posts after unmute without corrupting pagination', () => {
    const query = makeQuery(); const hook = renderHook(() => useFeedMuteFilter(query));
    expect(hook.result.current.data.pages[0].posts).toHaveLength(2);
    state.aliases = new Set(['bob-profile']); hook.rerender();
    expect(hook.result.current.data.pages[0]).toEqual({ posts: [other], nextPage: 3 });
    expect(query.data.pages[0].posts).toHaveLength(2);
    state.aliases = new Set(); hook.rerender(); expect(hook.result.current.data).toBe(query.data);
  });
  it('withholds persisted or placeholder pages until this account’s mutes are loaded', () => {
    state.ready = false; const hook = renderHook(() => useFeedMuteFilter(makeQuery()));
    expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.isPending).toBe(true);
    state.isError = true; state.error = new Error('Mutes unavailable'); hook.rerender();
    expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.isError).toBe(true); expect(hook.result.current.error).toBe(state.error);
  });
  it('keeps explicitly visited profiles and clips available even when mute loading fails', () => {
    state.ready = false; state.isError = true; state.aliases = new Set(['bob-profile']); const query = makeQuery();
    expect(renderHook(() => useFeedMuteFilter(query, true)).result.current).toBe(query);
  });
  it('retries saved preferences and the feed together', async () => {
    const query = makeQuery(); const hook = renderHook(() => useFeedMuteFilter(query)); await hook.result.current.refetch();
    expect(state.refetch).toHaveBeenCalledTimes(1); expect(query.refetch).toHaveBeenCalledTimes(1);
  });
  it('also filters non-infinite Explore results and preserves all-muted page cursors', () => {
    state.aliases = new Set(['bob-profile', 'other']); const query = makeQuery();
    expect(renderHook(() => useFeedMuteFilter(query)).result.current.data.pages[0]).toEqual({ posts: [], nextPage: 3 });
    const flat = { ...query, data: [first, other] };
    expect(renderHook(() => useFeedMuteFilter(flat)).result.current.data).toEqual([]);
  });
});
