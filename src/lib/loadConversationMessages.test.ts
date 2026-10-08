import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
const account = vi.hoisted(() => ({ uid: 'actor-1' as string | null, listeners: new Set<(user: { uid: string } | null) => void>() }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
const auth = vi.hoisted(() => ({ get currentUser() { return account.uid ? { uid: account.uid } : null; }, onAuthStateChanged(cb: (user: { uid: string } | null) => void) { account.listeners.add(cb); return () => account.listeners.delete(cb); } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/dmAccountScope', () => ({ isOwnedDmActor: (actorId: string, uid: string) => actorId === uid }));
function switchAccount(uid: string | null) { account.uid = uid; account.listeners.forEach(cb => cb(uid ? { uid } : null)); }

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

import { fetchRecentConversationMessages, fetchFullConversationMessageHistory } from '@/lib/conversationMessagesQuery';
import { prepareConversationForMessages } from '@/lib/dmMembershipRepair';
import { loadConversationMessages, MESSAGE_FETCH_TIMEOUT_MS } from '@/lib/loadConversationMessages';

describe('loadConversationMessages timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    switchAccount('actor-1');
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

  it('does not replace a permission denial with cached private text', async () => {
    const qc = new QueryClient();
    qc.setQueryData(messagesQueryKey('c1'), [{ id: 'private', conversation_id: 'c1', content: 'secret' }]);
    const denial = Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
    vi.mocked(fetchRecentConversationMessages).mockResolvedValue({ data: null, error: denial } as never);
    await expect(loadConversationMessages(qc, 'c1', 'actor-1')).rejects.toBe(denial);
  });

  it('retains denial when a recent-message retry has a transient failure', async () => {
    const qc = new QueryClient();
    qc.setQueryData(messagesQueryKey('c1'), [{ id: 'private', conversation_id: 'c1', content: 'secret' }]);
    const denial = Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
    vi.mocked(fetchRecentConversationMessages)
      .mockResolvedValueOnce({ data: null, error: denial } as never)
      .mockResolvedValueOnce({ data: null, error: new Error('Network unavailable') } as never);
    await expect(loadConversationMessages(qc, 'c1', 'actor-1')).rejects.toBe(denial);
  });

  it.each(['first', 'second', 'last'])('retains a %s full-history denial across later failed retries', async position => {
    const qc = new QueryClient();
    qc.setQueryData(messagesQueryKey('c1'), [{ id: 'private', conversation_id: 'c1', content: 'secret' }]);
    const denial = Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
    const transient = new Error('Network unavailable');
    vi.mocked(fetchFullConversationMessageHistory)
      .mockResolvedValueOnce({ data: [], error: position === 'first' ? denial : transient } as never)
      .mockResolvedValueOnce({ data: [], error: position === 'second' ? denial : transient } as never);
    vi.mocked(fetchRecentConversationMessages).mockResolvedValueOnce({ data: null, error: position === 'last' ? denial : transient } as never);
    await expect(loadConversationMessages(qc, 'c1', 'actor-1', { recentOnly: false })).rejects.toBe(denial);
  });

  it('retries a transient message failure without waiting for membership repair', async () => {
    const qc = new QueryClient();
    vi.mocked(prepareConversationForMessages).mockImplementation(() => new Promise(() => {}));
    vi.mocked(fetchRecentConversationMessages)
      .mockResolvedValueOnce({ data: null, error: new Error('fetchRecentConversationMessages timed out') } as never)
      .mockResolvedValueOnce({
        data: [{ id: 'm1', conversation_id: 'c1', sender_id: 'actor-1', content: 'hi', created_at: '2026-01-01T00:00:00.000Z', is_deleted: false }],
        error: null,
      } as never);
    await expect(loadConversationMessages(qc, 'c1', 'actor-1', { recentOnly: true })).resolves.toMatchObject([{ id: 'm1' }]);
    vi.mocked(prepareConversationForMessages).mockImplementation(() => Promise.resolve());
  });

  it('accepts a later successful server read after an initial denial', async () => {
    const qc = new QueryClient();
    const denial = Object.assign(new Error('Permission denied'), { code: 'permission-denied' });
    vi.mocked(fetchRecentConversationMessages)
      .mockResolvedValueOnce({ data: null, error: denial } as never)
      .mockResolvedValueOnce({ data: [{ id: 'verified', conversation_id: 'c1', sender_id: 'actor-1' }], error: null } as never);
    await expect(loadConversationMessages(qc, 'c1', 'actor-1')).resolves.toMatchObject([{ id: 'verified' }]);
  });

  it.each([false, true])('rejects a late load after an account change (returning=%s)', async returning => {
    const qc = new QueryClient();
    let finish!: (value: unknown) => void;
    vi.mocked(fetchRecentConversationMessages).mockImplementation(() => new Promise(resolve => { finish = resolve; }) as never);
    const result = loadConversationMessages(qc, 'c1', 'actor-1');
    const checked = expect(result).rejects.toMatchObject({ code: 'account-changed' });
    switchAccount('actor-2'); if (returning) switchAccount('actor-1');
    finish({ data: [{ id: 'private', conversation_id: 'c1', content: 'secret' }], error: null });
    await checked;
    expect(qc.getQueryData(messagesQueryKey('c1'))).toBeUndefined();
  });
});
