import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from './useMessages';

const state = vi.hoisted(() => ({ session: { uid: 'alice' as string | undefined, epoch: 1 }, fetchOlder: vi.fn() }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/conversationMessagesQuery', () => ({ CHAT_MAX_MESSAGE_HISTORY: 10000, CHAT_OLDER_MESSAGE_PAGE: 150, fetchOlderConversationMessages: state.fetchOlder }));
vi.mock('@/lib/loadConversationMessages', () => ({ MESSAGE_SELECT_SLIM: 'id,content,created_at' }));
import { useOlderMessages } from './useOlderMessages';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
import { conversationDetailQueryKey } from '@/lib/dmAccountScope';

const denial = { code: 'permission-denied', message: 'Missing or insufficient permissions.' };
const recent = { id: 'private-recent', conversation_id: 'thread', content: 'Private text', created_at: '2026-10-04T01:00:00Z', views: [], reactions: [] } as unknown as Message;
const older = { ...recent, id: 'private-older', created_at: '2026-10-03T01:00:00Z' };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  const key = messagesQueryKey('thread', state.session); const detailKey = conversationDetailQueryKey('thread', state.session);
  client.setQueryData(key, [recent]); client.setQueryData(detailKey, { id: 'thread', member_ids: ['alice'] });
  const cancel = vi.spyOn(client, 'cancelQueries'); const invalidate = vi.spyOn(client, 'invalidateQueries');
  return { client, key, detailKey, cancel, invalidate, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
beforeEach(() => { state.session = { uid: 'alice', epoch: 1 }; state.fetchOlder.mockReset().mockResolvedValue({ data: [], error: null, hasMore: false }); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

describe('older-message access denial', () => {
  it('clears private text and refetches only the current thread’s scoped messages and access detail', async () => {
    const context = setup(); const otherAccount = messagesQueryKey('thread', { uid: 'bob', epoch: 2 }); const otherRoute = messagesQueryKey('other', state.session);
    context.client.setQueryData(otherAccount, [{ ...recent, content: 'Bob own text' }]); context.client.setQueryData(otherRoute, [{ ...recent, content: 'Other thread text' }]);
    const messagesFetch = vi.fn().mockRejectedValue(denial); const detailFetch = vi.fn().mockRejectedValue(denial);
    const hook = renderHook(() => {
      const messages = useQuery({ queryKey: context.key, queryFn: messagesFetch });
      const detail = useQuery({ queryKey: context.detailKey, queryFn: detailFetch });
      return { older: useOlderMessages('thread'), messages, detail };
    }, context);
    state.fetchOlder.mockResolvedValue({ data: null, error: denial, hasMore: false });
    await act(async () => { await hook.result.current.older.loadOlderMessages(); });
    expect(context.client.getQueryData(context.key)).toEqual([]);
    expect(context.client.getQueryState(context.key)?.status).toBe('error'); expect(context.client.getQueryState(context.detailKey)?.status).toBe('error');
    expect(messagesFetch).toHaveBeenCalledTimes(1); expect(detailFetch).toHaveBeenCalledTimes(1);
    expect(context.cancel).toHaveBeenCalledWith({ queryKey: context.key, exact: true });
    expect(context.invalidate.mock.calls.map(([filters]) => filters)).toEqual([{ queryKey: context.key, exact: true }, { queryKey: context.detailKey, exact: true }]);
    expect(context.client.getQueryData(otherAccount)).toEqual([expect.objectContaining({ content: 'Bob own text' })]);
    expect(context.client.getQueryData(otherRoute)).toEqual([expect.objectContaining({ content: 'Other thread text' })]);
    expect(hook.result.current.older.hasMoreOlder).toBe(false); expect(hook.result.current.older.isLoadingOlder).toBe(false);
  });
  it.each(['firestore/permission-denied', 'unauthenticated'])('also handles a thrown %s without retaining cached text', async code => {
    const context = setup(); state.fetchOlder.mockRejectedValue(Object.assign(new Error('Access denied'), { code }));
    const hook = renderHook(() => useOlderMessages('thread'), context);
    await act(async () => { await hook.result.current.loadOlderMessages(); });
    expect(context.client.getQueryData(context.key)).toEqual([]); expect(context.invalidate).toHaveBeenCalledTimes(2);
  });
  it('does not erase an authorized cache for a transient network failure', async () => {
    const context = setup(); state.fetchOlder.mockResolvedValue({ data: null, error: { code: 'unavailable', message: 'Offline' }, hasMore: false });
    const hook = renderHook(() => useOlderMessages('thread'), context);
    await act(async () => { await hook.result.current.loadOlderMessages(); });
    expect(context.client.getQueryData(context.key)).toEqual([recent]); expect(context.cancel).not.toHaveBeenCalled(); expect(context.invalidate).not.toHaveBeenCalled();
  });
  it.each(['account', 'account-aba', 'route', 'route-aba', 'unmount'] as const)('ignores an older denial after %s changed', async change => {
    const response = deferred<unknown>(); state.fetchOlder.mockReturnValue(response.promise); const context = setup();
    const hook = renderHook(({ id }) => useOlderMessages(id), { ...context, initialProps: { id: 'thread' } });
    let pending!: Promise<void>; act(() => { pending = hook.result.current.loadOlderMessages(); });
    if (change === 'account' || change === 'account-aba') {
      state.session = { uid: 'bob', epoch: 2 }; hook.rerender({ id: 'thread' });
      if (change === 'account-aba') { state.session = { uid: 'alice', epoch: 3 }; hook.rerender({ id: 'thread' }); }
    } else if (change === 'unmount') hook.unmount();
    else { hook.rerender({ id: 'other' }); if (change === 'route-aba') hook.rerender({ id: 'thread' }); }
    await act(async () => { response.resolve({ data: null, error: denial, hasMore: false }); await pending; });
    expect(context.client.getQueryData(context.key)).toEqual([recent]); expect(context.cancel).not.toHaveBeenCalled(); expect(context.invalidate).not.toHaveBeenCalled();
    if (change !== 'unmount') expect(hook.result.current.hasMoreOlder).toBe(true);
  });
  it('does not restore old-route text when a successful page returns after navigating away and back', async () => {
    const response = deferred<unknown>(); state.fetchOlder.mockReturnValue(response.promise); const context = setup();
    const hook = renderHook(({ id }) => useOlderMessages(id), { ...context, initialProps: { id: 'thread' } });
    let pending!: Promise<void>; act(() => { pending = hook.result.current.loadOlderMessages(); });
    hook.rerender({ id: 'other' }); hook.rerender({ id: 'thread' });
    await act(async () => { response.resolve({ data: [older], error: null, hasMore: true }); await pending; });
    expect(context.client.getQueryData(context.key)).toEqual([recent]); expect(hook.result.current.isLoadingOlder).toBe(false);
  });
  it('rechecks the lifetime if the account changes while cancelling the exact in-flight query', async () => {
    const context = setup(); const cancellation = deferred<void>(); context.cancel.mockReturnValue(cancellation.promise);
    state.fetchOlder.mockResolvedValue({ data: null, error: denial, hasMore: false }); const hook = renderHook(() => useOlderMessages('thread'), context);
    let pending!: Promise<void>; act(() => { pending = hook.result.current.loadOlderMessages(); });
    await vi.waitFor(() => expect(context.cancel).toHaveBeenCalledTimes(1)); state.session = { uid: 'bob', epoch: 2 }; hook.rerender();
    await act(async () => { cancellation.resolve(); await pending; });
    expect(context.client.getQueryData(context.key)).toEqual([recent]); expect(context.invalidate).not.toHaveBeenCalled();
  });
  it('still prepends unique authorized older rows in chronological order', async () => {
    const context = setup(); state.fetchOlder.mockResolvedValue({ data: [recent, older], error: null, hasMore: true });
    const hook = renderHook(() => useOlderMessages('thread'), context);
    await act(async () => { await hook.result.current.loadOlderMessages(); });
    expect(context.client.getQueryData(context.key)).toEqual([older, recent]); expect(hook.result.current.hasMoreOlder).toBe(true);
  });
});
