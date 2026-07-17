import { describe, expect, it } from 'vitest';
import { resolveOwnMessageStatus } from './messageReadStatus';
import type { Message } from '@/hooks/useMessages';

function msg(partial: Partial<Message> & Pick<Message, 'id' | 'sender_id'>): Message {
  return {
    conversation_id: 'c1',
    content: 'hi',
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  } as Message;
}

describe('resolveOwnMessageStatus', () => {
  it('does not treat self dual-id views as opened', () => {
    const status = resolveOwnMessageStatus(
      msg({
        id: 'm1',
        sender_id: 'profile-me',
        views: [{ user_id: 'auth-me', viewed_at: '2026-01-01T00:01:00.000Z' }],
      }),
      { senderIds: ['profile-me', 'auth-me'] },
    );
    expect(status).toBe('delivered');
  });

  it('marks opened when a non-sender view exists', () => {
    const status = resolveOwnMessageStatus(
      msg({
        id: 'm1',
        sender_id: 'profile-me',
        views: [{ user_id: 'peer', viewed_at: '2026-01-01T00:01:00.000Z' }],
      }),
      { senderIds: ['profile-me', 'auth-me'] },
    );
    expect(status).toBe('opened');
  });

  it('marks opened from peer last_read_at', () => {
    const status = resolveOwnMessageStatus(
      msg({
        id: 'm1',
        sender_id: 'profile-me',
        created_at: '2026-01-01T00:00:00.000Z',
        views: [],
      }),
      {
        peerLastReadAt: '2026-01-01T00:02:00.000Z',
        senderIds: ['profile-me'],
      },
    );
    expect(status).toBe('opened');
  });
});
