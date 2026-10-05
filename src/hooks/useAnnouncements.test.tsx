import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ reads: [] as string[], insert: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: { id: 'author' } }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => 'author' }));
vi.mock('@/lib/firebase', () => ({ db: { from: (name: string) => {
  state.reads.push(name);
  if (name === 'notification_preferences') throw new Error('Raw preference fanout is forbidden');
  if (name === 'announcements') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'announcement' }, error: null }) }) }) };
  if (name === 'profiles') return { select: () => ({ neq: async () => ({ data: [{ id: 'push-enabled' }, { id: 'push-disabled' }] }) }) };
  if (name === 'notifications') return { insert: state.insert };
  throw new Error(`Unexpected ${name}`);
} } }));
import { useCreateAnnouncement } from './useAnnouncements';
it('preserves inbox announcements for every recipient without reading other users push preferences', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useCreateAnnouncement(), { wrapper });
  await act(async () => { await result.current.mutateAsync({ title: 'News', content: 'Details' }); });
  expect(state.reads).not.toContain('notification_preferences');
  expect(state.insert).toHaveBeenCalledWith([{ user_id: 'push-enabled', actor_id: 'author', type: 'announcement' }, { user_id: 'push-disabled', actor_id: 'author', type: 'announcement' }]);
});
