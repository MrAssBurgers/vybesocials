import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({
  profileId: 'profile-alice' as string | undefined,
  userId: 'alice' as string | null,
  rowsFor(filters: Array<{ field: string; value: unknown }>) {
    return { data: [] as Array<Record<string, unknown>>, error: null as { code?: string; message?: string } | null };
  },
}));

vi.mock('@/lib/firebase', () => ({
  db: {
    from: () => {
      const filters: Array<{ field: string; value: unknown }> = [];
      const query: {
        select: () => typeof query;
        eq: (field: string, value: unknown) => typeof query;
        limit: () => typeof query;
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
      } = {
        select: () => query,
        eq: (field, value) => {
          filters.push({ field, value });
          return query;
        },
        limit: () => query,
        then: (resolve, reject) => Promise.resolve(state.rowsFor(filters)).then(resolve, reject),
      };
      return query;
    },
  },
}));
vi.mock('@/lib/realtimeChannel', () => ({
  subscribePostgresChannel: () => ({}),
  removeRealtimeChannel: () => {},
}));
const inbox = vi.hoisted(() => ({ load: vi.fn(async () => [] as Array<Record<string, unknown>>) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => state.profileId }));
vi.mock('@/lib/friendRequestNotice', () => ({
  loadIncomingFriendRequestsFromNotices: (...args: unknown[]) => inbox.load(...args),
  ensureFriendRequestNotice: vi.fn(),
}));

import { useFriendRequests } from './useFriends';

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return wrapper;
}

afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  state.profileId = 'profile-alice';
  state.userId = 'alice';
  inbox.load.mockReset();
  inbox.load.mockResolvedValue([]);
});

const pending = {
  id: 'req-1',
  status: 'pending',
  receiver_id: 'profile-alice',
  sender_id: 'bob',
  created_at: '2026-02-02T00:00:00.000Z',
};
const accepted = {
  id: 'req-2',
  status: 'accepted',
  receiver_id: 'profile-alice',
  sender_id: 'cara',
  created_at: '2026-02-01T00:00:00.000Z',
};

describe('pending friend request reads', () => {
  it('keeps pending rows when the status filter is rejected', async () => {
    state.rowsFor = (filters) => {
      if (filters.some((filter) => filter.field === 'status')) {
        return { data: [], error: { code: 'failed-precondition', message: 'The query requires an index.' } };
      }
      return { data: [accepted, pending], error: null };
    };
    const view = renderHook(() => useFriendRequests(), { wrapper: setup() });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data?.incoming.map((row) => row.id)).toEqual(['req-1']);
    expect(view.result.current.isError).toBe(false);
  });

  it('uses the Auth uid when the profile id is not allowed to list requests', async () => {
    state.rowsFor = (filters) => {
      const party = filters.find((filter) => filter.field === 'receiver_id' || filter.field === 'sender_id');
      if (party?.value === 'profile-alice') {
        return { data: [], error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } };
      }
      return {
        data: [{ ...pending, id: 'req-uid', receiver_id: 'alice' }],
        error: null,
      };
    };
    const view = renderHook(() => useFriendRequests(), { wrapper: setup() });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data?.incoming.map((row) => row.id)).toEqual(['req-uid']);
  });

  it('uses getFriendshipState notices when every friend_requests read is denied', async () => {
    state.rowsFor = () => ({ data: [], error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } });
    inbox.load.mockResolvedValue([{
      id: 'qa1_qa2',
      sender_id: 'qa1',
      receiver_id: 'profile-alice',
      status: 'pending',
      created_at: '2026-10-08T00:00:00.000Z',
    }]);
    const view = renderHook(() => useFriendRequests(), { wrapper: setup() });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(inbox.load).toHaveBeenCalled();
    expect(view.result.current.data?.incoming.map((row) => row.id)).toEqual(['qa1_qa2']);
  });

  it('stays empty instead of erroring when the denied list has no confirmed request', async () => {
    state.rowsFor = () => ({ data: [], error: { code: 'permission-denied', message: 'Missing or insufficient permissions.' } });
    const view = renderHook(() => useFriendRequests(), { wrapper: setup() });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data?.incoming).toEqual([]);
  });
});
