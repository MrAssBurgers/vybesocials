import { describe, expect, it, vi, beforeEach } from 'vitest';

const sendDmViaCloudFunction = vi.fn();

vi.mock('@/lib/firebase/dmSendClient', () => ({
  sendDmViaCloudFunction: (...args: unknown[]) => sendDmViaCloudFunction(...args),
  isRetryableSendError: () => false,
}));

vi.mock('@/lib/pushNotifications', () => ({
  sendMessagePush: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/challengeProgressClient', () => ({
  recordChallengeActivity: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  db: {
    from: () => ({
      update: () => ({
        eq: () => Promise.resolve({ error: null }),
      }),
    }),
  },
}));

describe('insertDmMessage — callable-only path', () => {
  beforeEach(() => {
    sendDmViaCloudFunction.mockReset();
  });

  it('routes every send through sendDmMessage and never touches client inserts', async () => {
    sendDmViaCloudFunction.mockResolvedValue({
      data: {
        id: 'msg1',
        conversation_id: 'a_b',
        sender_id: 'a',
        content: 'hi',
        view_mode: 'permanent',
        views: [],
        reactions: [],
      },
      error: null,
    });

    const { insertDmMessage } = await import('@/lib/dmSendCore');
    const result = await insertDmMessage(
      {
        conversation_id: 'a_b',
        sender_id: 'a',
        content: 'hi',
        client_message_id: 'temp-1',
      },
      { otherProfileId: 'b' },
    );

    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('msg1');
    expect(sendDmViaCloudFunction).toHaveBeenCalledTimes(1);
    expect(sendDmViaCloudFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'a_b',
        content: 'hi',
        clientMessageId: 'temp-1',
        otherProfileId: 'b',
      }),
    );
  });

  it('surfaces blocked errors without inventing a client write fallback', async () => {
    sendDmViaCloudFunction.mockResolvedValue({
      data: null,
      error: { message: "You can't message this user", code: 'permission-denied' },
    });

    const { insertDmMessage } = await import('@/lib/dmSendCore');
    const result = await insertDmMessage({
      conversation_id: 'a_b',
      sender_id: 'a',
      content: 'hi',
      media_url: 'https://example.com/x.jpg',
      message_type: 'image',
      client_message_id: 'temp-media',
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/can.?t message/i);
    expect(sendDmViaCloudFunction).toHaveBeenCalledTimes(1);
  });

  it('passes clientMessageId for duplicate reconnect / outbox retries', async () => {
    sendDmViaCloudFunction.mockResolvedValue({
      data: {
        id: 'msg-deduped',
        conversation_id: 'a_b',
        sender_id: 'a',
        content: 'retry',
        view_mode: 'permanent',
        views: [],
        reactions: [],
      },
      error: null,
    });

    const { insertDmMessage } = await import('@/lib/dmSendCore');
    await insertDmMessage({
      conversation_id: 'a_b',
      sender_id: 'a',
      content: 'retry',
      client_message_id: 'temp-reconnect',
      reply_to_id: 'old-msg',
    });

    expect(sendDmViaCloudFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMessageId: 'temp-reconnect',
        replyToId: 'old-msg',
      }),
    );
  });
});
