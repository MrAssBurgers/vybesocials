import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, channels: [] as { topic: string; handlers: { event: string; callback: (data: any) => void }[] }[], membership: vi.fn(), sender: vi.fn(), notify: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => ({ select: () => ({ eq: () => table === 'profiles' ? { maybeSingle: state.sender } : state.membership() }) }) } }));
vi.mock('@/lib/foregroundDmNotification', () => ({ maybeShowForegroundDmNotification: state.notify }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: (topic: string, handlers: any[]) => { const channel = { topic, handlers }; state.channels.push(channel); return channel; }, removeRealtimeChannel: state.remove, removeChannelByTopic: vi.fn() }));
import { applyBroadcastMessage, setupScopedMessageRealtime, type ScopedMessageRealtimeContext } from './dmScopedMessageRealtime';
import { dmListQueryKey } from './dmAccountScope';
import { messagesQueryKey } from './messagesQueryKey';
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; };
const flush = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };
const message = (id = 'message-1') => ({ id, conversation_id: 'room', sender_id: 'bob-profile', content: 'Private text', created_at: new Date().toISOString() });
function setup(knownSender = true) {
  const client = new QueryClient(); const session = { ...state.session };
  const context: ScopedMessageRealtimeContext = { profileId: 'alice-profile', authUid: 'alice', accountSession: session, queryClient: client,
    getViewingConversationId: () => 'room', isMessageProcessed: () => false, markMessageProcessed: vi.fn(), isOptimisticDuplicate: () => false, scheduleUnknownConvoRefetch: vi.fn() };
  client.setQueryData(dmListQueryKey('alice-profile', session), [{ id: 'room', member_ids: ['alice-profile', 'bob-profile'],
    members: knownSender ? [{ user_id: 'bob-profile', profile: { id: 'bob-profile', username: 'bob' } }] : [] }]);
  const handle = setupScopedMessageRealtime(context);
  return { client, context, session, handle, key: messagesQueryKey('room', session) };
}
function event(name: string, value = message()) {
  const channel = state.channels.find(entry => entry.topic.endsWith(':room') && entry.topic.startsWith('global-messages:'))!;
  channel.handlers.find(handler => handler.event === name)!.callback({ new: value, old: value });
}
beforeEach(() => { state.session = { uid: 'alice', epoch: 1 }; state.channels = []; state.membership.mockReset().mockResolvedValue({ data: [] }); state.sender.mockReset().mockResolvedValue({ data: null }); state.notify.mockReset(); state.remove.mockReset(); });

describe('message realtime keeps the initiating account and lifetime', () => {
  it('writes inserts and updates only to the captured session key', async () => {
    const env = setup(); await flush();
    env.client.setQueryData(['messages', 'room'], [{ id: 'legacy', content: 'Keep untouched' }]);
    event('INSERT');
    expect(env.client.getQueryData<any[]>(env.key)?.[0].content).toBe('Private text');
    event('UPDATE', { ...message(), content: 'Edited text' });
    expect(env.client.getQueryData<any[]>(env.key)?.[0].content).toBe('Edited text');
    expect(env.client.getQueryData<any[]>(['messages', 'room'])?.[0].id).toBe('legacy');
    env.handle.teardown(); env.client.clear();
  });
  it.each(['INSERT', 'UPDATE', 'DELETE'])('drops late %s callbacks after account change and ABA', async name => {
    const env = setup(); await flush(); const original = message(); env.client.setQueryData(env.key, [original]);
    state.session = { uid: 'bob', epoch: 2 }; event(name);
    state.session = { uid: 'alice', epoch: 3 }; event(name);
    expect(env.context.markMessageProcessed).not.toHaveBeenCalled();
    expect(env.client.getQueryData(env.key)).toEqual([original]);
    expect(env.client.getQueryData(messagesQueryKey('room', state.session))).toBeUndefined();
    expect(state.notify).not.toHaveBeenCalled(); env.handle.teardown(); env.client.clear();
  });
  it('rejects payloads for a different conversation on a scoped channel', async () => {
    const env = setup(); await flush(); event('INSERT', { ...message(), conversation_id: 'other-room' });
    expect(env.context.markMessageProcessed).not.toHaveBeenCalled(); expect(env.client.getQueryData(env.key)).toBeUndefined();
    env.handle.teardown(); env.client.clear();
  });
  it('cannot rebind an old subscription by mutating or replacing its context', async () => {
    const env = setup(); await flush(); env.context.authUid = 'bob'; env.context.accountSession = { uid: 'bob', epoch: 2 };
    state.session = { uid: 'bob', epoch: 2 }; env.handle.updateContext(env.context); event('INSERT');
    expect(env.client.getQueryData(messagesQueryKey('room', state.session))).toBeUndefined();
    env.handle.teardown(); env.client.clear();
  });
  it.each(['account', 'teardown'])('stops delayed sender enrichment after %s ends the operation', async cause => {
    const reply = deferred<{ data: { id: string; username: string } }>(); state.sender.mockReturnValue(reply.promise);
    const env = setup(false); await flush(); event('INSERT');
    if (cause === 'account') state.session = { uid: 'alice', epoch: 3 }; else env.handle.teardown();
    reply.resolve({ data: { id: 'bob-profile', username: 'late-sender' } }); await flush();
    expect(env.client.getQueryData<any[]>(env.key)?.[0].sender).toBeNull();
    env.handle.teardown(); env.client.clear();
  });
  it('does not attach channels after a delayed membership read outlives teardown', async () => {
    const result = deferred<{ data: { conversation_id: string }[] }>(); state.membership.mockReturnValue(result.promise);
    const env = setup(); env.handle.teardown(); result.resolve({ data: [{ conversation_id: 'old-room' }] }); await flush();
    expect(state.channels.filter(channel => channel.topic.startsWith('global-messages:'))).toEqual([]); env.client.clear();
  });
  it('drops direct broadcasts when their captured account or lifetime is no longer current', () => {
    const env = setup(); state.session = { uid: 'alice', epoch: 3 }; applyBroadcastMessage(env.context, message());
    expect(env.client.getQueryData(env.key)).toBeUndefined();
    state.session = env.session; applyBroadcastMessage({ ...env.context, isActive: () => false }, message());
    expect(env.client.getQueryData(env.key)).toBeUndefined(); env.handle.teardown(); env.client.clear();
  });
});
