import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ reads: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => {
  const query = {
    select: () => query, eq: () => query, lt: () => query, order: () => query,
    limit: (...args: unknown[]) => state.reads(...args),
  };
  return query;
} } }));

import { fetchOlderConversationMessages, fetchRecentConversationMessages } from './conversationMessagesQuery';

describe('private message query denials', () => {
  beforeEach(() => state.reads.mockReset());
  it.each(['recent', 'older'])('does not replace a denied %s query with an index fallback', async kind => {
    const denial = { code: 'permission-denied', message: 'Access denied' };
    state.reads.mockResolvedValueOnce({ data: null, error: denial });
    state.reads.mockResolvedValueOnce({ data: null, error: { message: 'Network unavailable' } });
    const result = kind === 'recent'
      ? await fetchRecentConversationMessages('chat', '*')
      : await fetchOlderConversationMessages('chat', '*', '2026-01-01T00:00:00Z');
    expect(result).toMatchObject({ data: null, error: denial });
    expect(state.reads).toHaveBeenCalledTimes(1);
  });
  it('still allows a verified index-free result after an index failure', async () => {
    state.reads.mockResolvedValueOnce({ data: null, error: { code: 'failed-precondition', message: 'Index required' } });
    state.reads.mockResolvedValueOnce({ data: [{ id: 'verified', created_at: '2026-01-01T00:00:00Z' }], error: null });
    await expect(fetchRecentConversationMessages('chat', '*')).resolves.toMatchObject({ data: [{ id: 'verified' }], error: null });
    expect(state.reads).toHaveBeenCalledTimes(2);
  });
});
