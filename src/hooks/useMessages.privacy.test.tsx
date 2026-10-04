import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ uid: 'alice', listeners: new Set<(user: { uid: string } | null) => void>(), load: vi.fn() }));
const nativeAuth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged(cb: (user: { uid: string } | null) => void) { state.listeners.add(cb); return () => state.listeners.delete(cb); } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => nativeAuth, firebaseAuth: {} }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `${state.uid}-profile`, user_id: state.uid } }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => `${state.uid}-profile` }));
vi.mock('@/lib/loadConversationMessages', () => ({ loadConversationMessages: (...args: unknown[]) => state.load(...args), MESSAGE_SELECT_MINIMAL: '', MESSAGE_SELECT_WARM: '' }));
import { useMessages, type Message } from './useMessages';
import { messagesQueryKey } from '@/lib/messagesQueryKey';

function switchTo(uid: string) { state.uid = uid; state.listeners.forEach(cb => cb({ uid })); }
const row = (content: string) => ({ id: content, conversation_id: 'c', content, created_at: '2026-01-01T00:00:00Z', views: [], reactions: [] } as unknown as Message);
beforeEach(() => { switchTo('alice'); state.load.mockReset(); });
afterEach(cleanup);
const wrap = (client: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

describe('mounted private message views', () => {
  it('does not show another account or legacy cache while a new account loads', async () => {
    const client = new QueryClient();
    client.setQueryData(['messages', 'c'], [row('unowned legacy')]);
    client.setQueryData(messagesQueryKey('c'), [row('Alice secret')]);
    state.load.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useMessages('c'), { wrapper: wrap(client) });
    expect(result.current.data.map(m => m.content)).toEqual(['Alice secret']);
    act(() => switchTo('moderator'));
    expect(result.current.data).toEqual([]);
    expect(state.load).toHaveBeenLastCalledWith(client, 'c', 'moderator-profile', expect.objectContaining({ session: expect.objectContaining({ uid: 'moderator' }) }));
    client.clear();
  });

  it.each([false, true])('rejects an old pending result after switch (returning=%s)', async returning => {
    const client = new QueryClient();
    let finish!: (value: Message[]) => void;
    state.load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue([]);
    const { result } = renderHook(() => useMessages('c'), { wrapper: wrap(client) });
    act(() => { switchTo('bob'); if (returning) switchTo('alice'); });
    await act(async () => finish([row('Late Alice secret')]));
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(client.getQueryData(messagesQueryKey('c'))).toEqual([]);
    client.clear();
  });
});
