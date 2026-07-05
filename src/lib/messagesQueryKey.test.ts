import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Message } from '@/hooks/useMessages';
import {
  appendIncomingMessage,
  mergeMessagesWithLocalCache,
  messagesQueryKey,
  replaceOptimisticMessage,
} from '@/lib/messagesQueryKey';

const CONV = 'conv-1';

function msg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversation_id: CONV,
    sender_id: 'sender-1',
    content: 'hello',
    media_url: null,
    media_type: null,
    message_type: 'text',
    view_mode: 'permanent',
    expires_at: null,
    is_deleted: false,
    reply_to_id: null,
    created_at: '2026-07-01T12:00:00.000Z',
    views: [],
    reactions: [],
    ...overrides,
  } as Message;
}

function clientWithCache(messages: Message[]): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(messagesQueryKey(CONV), messages);
  return qc;
}

describe('appendIncomingMessage', () => {
  it('appends a new message', () => {
    const out = appendIncomingMessage([msg({ id: 'a' })], msg({ id: 'b', content: 'second' }));
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('does not duplicate an already-present message', () => {
    const existing = [msg({ id: 'a' })];
    expect(appendIncomingMessage(existing, msg({ id: 'a' }))).toBe(existing);
  });

  it('replaces the newest matching optimistic temp from the same sender', () => {
    const old = [
      msg({ id: 'temp-1', content: 'yo' }),
      msg({ id: 'temp-2', content: 'yo' }),
    ];
    const out = appendIncomingMessage(old, msg({ id: 'server-1', content: 'yo' }));
    // Only the newest temp (temp-2) is replaced; temp-1 is still in flight.
    expect(out.map((m) => m.id)).toEqual(['temp-1', 'server-1']);
  });

  it('keeps temps from other senders', () => {
    const old = [msg({ id: 'temp-1', sender_id: 'someone-else', content: 'yo' })];
    const out = appendIncomingMessage(old, msg({ id: 'server-1', content: 'yo' }));
    expect(out.map((m) => m.id)).toEqual(['temp-1', 'server-1']);
  });
});

describe('replaceOptimisticMessage', () => {
  it('swaps a temp row for the server row while keeping a stable client key', () => {
    const qc = clientWithCache([msg({ id: 'temp-1', content: 'yo' })]);
    replaceOptimisticMessage(qc, CONV, 'temp-1', msg({ id: 'server-1', content: 'yo' }));

    const cached = qc.getQueryData<Message[]>(messagesQueryKey(CONV))!;
    expect(cached).toHaveLength(1);
    expect(cached[0].id).toBe('server-1');
    // Stable key prevents the bubble from remounting on id swap.
    expect((cached[0] as { _clientKey?: string })._clientKey).toBe('temp-1');
  });

  it('drops the temp when the server row already arrived via realtime', () => {
    const qc = clientWithCache([
      msg({ id: 'temp-1', content: 'yo' }),
      msg({ id: 'server-1', content: 'yo' }),
    ]);
    replaceOptimisticMessage(qc, CONV, 'temp-1', msg({ id: 'server-1', content: 'yo' }));

    const cached = qc.getQueryData<Message[]>(messagesQueryKey(CONV))!;
    expect(cached.map((m) => m.id)).toEqual(['server-1']);
  });

  it('preserves the optimistic sender when the server row has none', () => {
    const sender = { id: 'sender-1', username: 'me', avatar_url: null, display_name: 'Me' };
    const qc = clientWithCache([msg({ id: 'temp-1', sender })]);
    replaceOptimisticMessage(qc, CONV, 'temp-1', msg({ id: 'server-1', sender: undefined }));

    const cached = qc.getQueryData<Message[]>(messagesQueryKey(CONV))!;
    expect(cached[0].sender?.username).toBe('me');
  });
});

describe('mergeMessagesWithLocalCache', () => {
  it('keeps optimistic temps and failed sends missing from the server page', () => {
    const qc = clientWithCache([
      msg({ id: 'temp-9', content: 'sending…' }),
      { ...msg({ id: 'failed-1', content: 'oops' }), _failed: true } as Message,
    ]);
    const server = [msg({ id: 'server-1' })];

    const merged = mergeMessagesWithLocalCache(qc, CONV, server);
    expect(merged.map((m) => m.id).sort()).toEqual(['failed-1', 'server-1', 'temp-9']);
  });

  it('keeps older paginated history not included in the recent server page', () => {
    const older = msg({ id: 'old-1', created_at: '2026-06-01T00:00:00.000Z' });
    const qc = clientWithCache([older]);
    const server = [msg({ id: 'new-1', created_at: '2026-07-01T00:00:00.000Z' })];

    const merged = mergeMessagesWithLocalCache(qc, CONV, server);
    expect(merged.map((m) => m.id)).toEqual(['old-1', 'new-1']);
  });

  it('drops stale local rows the server no longer returns', () => {
    // Newer than the oldest server row but older than 2 minutes → deleted remotely.
    const stale = msg({ id: 'stale-1', created_at: '2026-07-01T00:30:00.000Z' });
    const qc = clientWithCache([stale]);
    const server = [
      msg({ id: 'srv-old', created_at: '2026-07-01T00:00:00.000Z' }),
      msg({ id: 'srv-new', created_at: '2026-07-01T01:00:00.000Z' }),
    ];

    const merged = mergeMessagesWithLocalCache(qc, CONV, server);
    expect(merged.map((m) => m.id)).toEqual(['srv-old', 'srv-new']);
  });

  it('returns messages sorted oldest → newest', () => {
    const qc = clientWithCache([msg({ id: 'old-1', created_at: '2026-06-01T00:00:00.000Z' })]);
    const server = [
      msg({ id: 'b', created_at: '2026-07-01T02:00:00.000Z' }),
      msg({ id: 'a', created_at: '2026-07-01T01:00:00.000Z' }),
    ];

    const merged = mergeMessagesWithLocalCache(qc, CONV, server);
    expect(merged.map((m) => m.id)).toEqual(['old-1', 'a', 'b']);
  });
});
