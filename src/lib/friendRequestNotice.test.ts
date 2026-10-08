import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  invoke: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({
  db: {
    from: (table: string) => {
      const filters: Array<{ field: string; value: unknown }> = [];
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => {
          filters.push({ field, value });
          return query;
        },
        limit: () => query,
        insert: (row: Record<string, unknown>) => state.insert(table, row),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({
            data: state.rows.filter((row) => {
              if (table === 'notifications' && row.type !== 'friend_request') return false;
              return filters.every((filter) => row[filter.field] === filter.value);
            }),
            error: null,
          }).then(resolve, reject),
      };
      return query;
    },
    functions: { invoke: (...args: unknown[]) => state.invoke(...args) },
  },
}));

import { confirmedIncomingRequest, keepFriendRequestNotice } from './friendRequestNoticeModel';
import { ensureFriendRequestNotice, loadIncomingFriendRequestsFromNotices } from './friendRequestNotice';

beforeEach(() => {
  state.rows = [];
  state.invoke.mockReset();
  state.insert.mockReset();
  state.insert.mockResolvedValue({ error: null });
});

describe('incoming friend requests when the request list is denied', () => {
  it('keeps a notice only after the server confirms a pending incoming request id', () => {
    expect(confirmedIncomingRequest(
      { actor_id: 'qa1', created_at: '2026-10-08T00:00:00.000Z' },
      { state: 'pending_incoming', request_id: 'qa1_qa2' },
      'qa2',
      { id: 'qa1', username: 'vybe_qa_test', avatar_url: null, display_name: 'QA' },
    )).toMatchObject({ id: 'qa1_qa2', sender_id: 'qa1', receiver_id: 'qa2', status: 'pending' });
    expect(confirmedIncomingRequest({ actor_id: 'qa1' }, { state: 'pending_outgoing', request_id: 'x' }, 'qa2')).toBeNull();
    expect(confirmedIncomingRequest({ actor_id: 'qa1' }, { state: 'pending_incoming' }, 'qa2')).toBeNull();
  });

  it('shows a friend-request notice while the request list is unknown', () => {
    expect(keepFriendRequestNotice('friend_request', 'qa1', new Set(), false)).toBe(true);
    expect(keepFriendRequestNotice('friend_request', 'qa1', new Set(), true)).toBe(false);
    expect(keepFriendRequestNotice('friend_request', 'qa1', new Set(['qa1']), true)).toBe(true);
    expect(keepFriendRequestNotice('follow', 'qa1', new Set(), true)).toBe(true);
  });

  it('builds the accept row from a readable notice and getFriendshipState', async () => {
    state.rows = [
      { type: 'friend_request', user_id: 'qa2', actor_id: 'qa1', created_at: '2026-10-08T00:00:00.000Z' },
      { type: 'follow', user_id: 'qa2', actor_id: 'other' },
      { id: 'qa1', user_id: 'qa1', username: 'vybe_qa_test', avatar_url: null, display_name: 'QA' },
    ];
    state.invoke.mockResolvedValue({ data: { state: 'pending_incoming', request_id: 'qa1_qa2' }, error: null });
    const rows = await loadIncomingFriendRequestsFromNotices(['qa2'], 'qa2');
    expect(state.invoke).toHaveBeenCalledWith('get-friendship-state', { target_profile_id: 'qa1' });
    expect(rows).toEqual([
      expect.objectContaining({
        id: 'qa1_qa2',
        sender_id: 'qa1',
        status: 'pending',
        sender: expect.objectContaining({ username: 'vybe_qa_test' }),
      }),
    ]);
  });

  it('writes one friend-request notice for a pending send, including a repeat send', async () => {
    await ensureFriendRequestNotice('qa2', 'qa1');
    await ensureFriendRequestNotice('qa2', 'qa1');
    expect(state.insert).toHaveBeenCalledTimes(1);
    expect(state.insert).toHaveBeenCalledWith('notifications', expect.objectContaining({
      user_id: 'qa2',
      actor_id: 'qa1',
      type: 'friend_request',
      read: false,
      deep_link: '/friends/add?tab=requests',
    }));
  });
});
