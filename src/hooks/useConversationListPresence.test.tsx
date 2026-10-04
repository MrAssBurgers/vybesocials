import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ subscribe: vi.fn(), stop: vi.fn(), callback: null as null | ((value: unknown) => void) }));
vi.mock('@/lib/usersPresenceDoc', () => ({ subscribeUserPresence: state.subscribe, toUiActivity: (value: unknown) => value ? 'online' : 'offline' }));
vi.mock('@/lib/presenceActivity', () => ({ uiActivityFromState: () => 'active' }));
vi.mock('@/lib/dmMemberResolve', () => ({ inferOtherUserIdFromConversation: () => 'peer' }));
vi.mock('@/lib/dmConversationSort', () => ({ sortDmConversations: (value: unknown) => value }));
import { useConversationListPresence } from './useConversationListPresence';

beforeEach(() => {
  state.stop.mockReset();
  state.subscribe.mockReset().mockImplementation((_peer, callback) => { state.callback = callback; callback(null); return state.stop; });
});
afterEach(cleanup);

describe('mounted empty inbox presence', () => {
  it('settles when a mounted chat supplies a fresh empty conversation array each render', () => {
    let renders = 0;
    const { result, rerender } = renderHook(() => {
      if (++renders > 8) throw new Error('Presence caused a render loop');
      return useConversationListPresence([], 'profile-alice', 'alice', 'private-thread');
    });
    const empty = result.current;
    rerender(); rerender();
    expect(result.current).toBe(empty);
    expect(renders).toBe(3);
    expect(state.subscribe).not.toHaveBeenCalled();
  });

  it('does not resubscribe to identical peers when equivalent arrays are recreated', () => {
    const { result, rerender } = renderHook(() => useConversationListPresence([{ id: 'cid', is_group: false } as never], 'profile-alice', 'alice'));
    const empty = result.current;
    rerender(); rerender();
    expect(result.current).toBe(empty);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
  });

  it('clears previous presence once and ignores late callbacks after the chat pauses the inbox', () => {
    const { result, rerender } = renderHook(({ paused }) => useConversationListPresence(paused ? [] : [{ id: 'cid', is_group: false } as never], 'profile-alice', 'alice'), { initialProps: { paused: false } });
    act(() => state.callback?.({ online: true }));
    expect(result.current.get('cid')).toBe('active');
    rerender({ paused: true });
    const cleared = result.current;
    expect(cleared.size).toBe(0);
    expect(state.stop).toHaveBeenCalledTimes(1);
    act(() => state.callback?.({ online: true }));
    rerender({ paused: true });
    expect(result.current).toBe(cleared);
  });
});
