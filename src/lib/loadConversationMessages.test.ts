import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { messagesQueryKey } from '@/lib/messagesQueryKey';

vi.mock('@/lib/conversationMessagesQuery', () => ({
  CHAT_INITIAL_MESSAGE_LIMIT: 200,
  CHAT_MAX_MESSAGE_HISTORY: 10000,
  fetchRecentConversationMessages: vi.fn(),
  fetchFullConversationMessageHistory: vi.fn(),
}));

vi.mock('@/lib/dmMembershipRepair', () => ({
  inferOtherParticipantId: vi.fn(() => null),
  isConversationMessagesReady: vi.fn(() => true),
  prepareConversationForMessages: vi.fn(() => Promise.resolve()),
  fetchMemberProfiles: vi.fn(() => Promise.resolve(new Map())),
}));

vi.mock('@/lib/resolveSessionProfileId', () => ({
  syncSessionProfileId: vi.fn((id?: string | null) => id || undefined),
  resolveSessionProfileId: vi.fn(async () => 'actor-1'),
}));

import { fetchRecentConversationMessages } from '@/lib/conversationMessagesQuery';
import { loadConversationMessages, MESSAGE_FETCH_TIMEOUT_MS } from '@/lib/loadConversationMessages';

describe('loadConversationMessages timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns seed cache when recent fetch hangs past timeout', async () => {
    const seed = [
      {
        id: 'seed-1',
        conversation_id: 'c1',
        sender_id: 'actor-1',
        content: 'hi',
        created_at: '2026-01-01T00:00:00.000Z',
        is_deleted: false,
      },
    ];
    const qc = new QueryClient();
    qc.setQueryData(messagesQueryKey('c1'), seed);

    vi.mocked(fetchRecentConversationMessages).mockImplementation(
      () => new Promise(() => {}),
    );

    const resultPromise = loadConversationMessages(qc, 'c1', 'actor-1', {
      recentOnly: true,
    });
    await vi.advanceTimersByTimeAsync(MESSAGE_FETCH_TIMEOUT_MS * 2 + 3500);
    const result = await resultPromise;

    expect(result.some((m) => m.id === 'seed-1')).toBe(true);
  });

  it('throws when hung fetch has no seed to paint', async () => {
    const qc = new QueryClient();
    vi.mocked(fetchRecentConversationMessages).mockImplementation(
      () => new Promise(() => {}),
    );

    const resultPromise = loadConversationMessages(qc, 'c1', 'actor-1', {
      recentOnly: true,
    });
    // attach rejection handler before advancing timers to avoid unhandled rejection
    const outcome = resultPromise.then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e }),
    );
    await vi.advanceTimersByTimeAsync(MESSAGE_FETCH_TIMEOUT_MS * 2 + 3500);
    const result = await outcome;
    expect(result.ok).toBe(false);
  });
});
