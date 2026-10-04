import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const account = vi.hoisted(() => ({ uid: 'alice' as string | null, listeners: new Set<(user: { uid: string } | null) => void>() }));
const auth = vi.hoisted(() => ({ get currentUser() { return account.uid ? { uid: account.uid } : null; }, onAuthStateChanged(cb: (user: { uid: string } | null) => void) { account.listeners.add(cb); return () => account.listeners.delete(cb); } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
import { messagesQueryKey, patchMessagesCache, readMessagesCache, replaceOptimisticMessage } from './messagesQueryKey';
import { reportAccountSnapshot } from './reportModerationService';
import type { Message } from '@/hooks/useMessages';
const message = { id: 'temp-private', conversation_id: 'c', content: 'Private Alice text', views: [], reactions: [] } as unknown as Message;
function switchTo(uid: string | null) { account.uid = uid; account.listeners.forEach(cb => cb(uid ? { uid } : null)); }
beforeEach(() => switchTo('alice'));

describe('private thread cache ownership', () => {
  it('ignores legacy unowned snapshots and another current account', () => {
    const client = new QueryClient();
    client.setQueryData(['messages', 'c'], [message]);
    expect(readMessagesCache(client, 'c')).toEqual([]);
    client.setQueryData(messagesQueryKey('c'), [message]);
    expect(readMessagesCache(client, 'c')).toHaveLength(1);
    switchTo('moderator');
    expect(readMessagesCache(client, 'c')).toEqual([]);
  });

  it.each([false, true])('drops late optimistic completion after switch (returning=%s)', returning => {
    const client = new QueryClient();
    const alice = reportAccountSnapshot();
    client.setQueryData(messagesQueryKey('c', alice), [message]);
    switchTo('bob'); if (returning) switchTo('alice');
    patchMessagesCache(client, 'c', () => [message], alice);
    replaceOptimisticMessage(client, 'c', message.id, { ...message, id: 'server-private' }, alice);
    expect(client.getQueryData(messagesQueryKey('c'))).toBeUndefined();
    expect(readMessagesCache(client, 'c', alice)).toEqual([]);
    expect(client.getQueryData(messagesQueryKey('c', alice))).toEqual([message]);
  });
});
