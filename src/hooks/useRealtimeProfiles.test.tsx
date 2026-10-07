import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  bindings: [] as { filter?: string; table?: string; callback: (payload: { new: Record<string, unknown> }) => void }[],
}));

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'alice' }, authReady: true }) }));
vi.mock('@/lib/realtimeChannel', () => ({
  subscribePostgresChannel: (_topic: string, bindings: typeof state.bindings) => {
    state.bindings = bindings;
    return { unsubscribe() {} };
  },
  removeRealtimeChannel: vi.fn(),
}));
vi.mock('@/lib/invalidateConversationCaches', () => ({
  patchAuthorOnPostCaches: vi.fn(),
  patchEmbeddedProfileInCaches: vi.fn(),
}));

import { patchAuthorOnPostCaches } from '@/lib/invalidateConversationCaches';
import { useRealtimeProfiles } from './useRealtimeProfiles';

function wrap() {
  const client = new QueryClient();
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  };
}

describe('own profile realtime', () => {
  it('filters the listener to the signed-in account and ignores activity heartbeats', () => {
    state.bindings = [];
    const env = wrap();
    env.client.setQueryData(['profile', 'alice'], {
      id: 'alice',
      username: 'ada',
      display_name: 'Ada',
      avatar_url: 'a.png',
      last_active_at: 'earlier',
    });
    const hook = renderHook(() => useRealtimeProfiles(), env);
    expect(state.bindings[0]).toMatchObject({ table: 'profiles', filter: 'user_id=eq.alice' });
    act(() => state.bindings[0].callback({
      new: { id: 'alice', username: 'ada', display_name: 'Ada', avatar_url: 'a.png', last_active_at: 'now' },
    }));
    expect(patchAuthorOnPostCaches).not.toHaveBeenCalled();
    expect(env.client.getQueryData(['profile', 'alice'])).toMatchObject({ last_active_at: 'earlier' });
    hook.unmount();
  });
});
