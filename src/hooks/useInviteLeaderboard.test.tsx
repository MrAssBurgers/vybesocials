import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ error: null as { message: string } | null }));

vi.mock('@/lib/firebase', () => ({
  db: {
    from: () => {
      const query = {
        select: () => query,
        limit: () => query,
        eq: () => query,
        single: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          Promise.resolve({ data: [], error: state.error }).then(resolve, reject),
      };
      return query;
    },
  },
}));
vi.mock('@/lib/auth', () => ({ useAuthOptional: () => ({ profile: { id: 'qa' } }) }));

import { useInviteLeaderboard } from './useInviteLeaderboard';

beforeEach(() => {
  state.error = { message: 'invite_leaderboard is not a collection' };
});

describe('invite leaderboard', () => {
  it('does not log or throw when the leftover leaderboard view cannot be read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = renderHook(() => useInviteLeaderboard(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data).toEqual({
      entries: [],
      currentUserEntry: null,
      currentUserInTop: false,
    });
    expect(error.mock.calls.some((call) => String(call[0]).includes('[useInviteLeaderboard]'))).toBe(false);
    error.mockRestore();
    client.clear();
  });
});
