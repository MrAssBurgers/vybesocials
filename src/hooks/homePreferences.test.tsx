import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: { uid: 'alice', epoch: 1 }, profileId: 'migrated-alice', read: vi.fn(), write: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.session.uid } }) }));
vi.mock('./useAuthProfileId', () => ({ useAuthProfileId: () => state.profileId }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('./use-mobile', () => ({ useIsMobileOrTablet: () => ({ isMobileOrTablet: true }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({
  select() { return this; }, eq() { return this; }, maybeSingle: state.read, upsert: state.write,
}) } }));
import { useUserPreferences, useUpdatePreferences } from './useUserPreferences';
import { useGridLayout } from './useGridLayout';
const clients: QueryClient[] = [];
function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
const key = () => ['user-preferences', state.session.uid, state.profileId, state.session.epoch];
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); state.session = { uid: 'alice', epoch: 1 }; state.profileId = 'migrated-alice';
  state.read.mockResolvedValue({ data: { button_sound: 'pop', extra: { color: 'blue' } }, error: null });
  state.write.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
it('never applies the old unscoped cache to a different account or missing server record', async () => {
  localStorage.setItem('vybe_user_prefs_cache', JSON.stringify({ extra: { secretLayout: true } }));
  state.read.mockResolvedValue({ data: null, error: null });
  const { wrapper } = fixture(); const hook = renderHook(useUserPreferences, { wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.data?.extra).toEqual({});
});
it('rolls a failed optimistic save back on the migrated profile key', async () => {
  const { wrapper, client } = fixture();
  const hook = renderHook(() => ({ read: useUserPreferences(), save: useUpdatePreferences() }), { wrapper });
  await waitFor(() => expect(hook.result.current.read.isSuccess).toBe(true));
  const original = client.getQueryData(key());
  state.write.mockResolvedValue({ error: new Error('Offline') });
  await act(async () => { await expect(hook.result.current.save.mutateAsync({ button_sound: 'click' })).rejects.toThrow('Offline'); });
  expect(client.getQueryData(key())).toEqual(original);
  expect(client.getQueryData(['user-preferences', 'alice'])).toBeUndefined();
});
it('drops a late save acknowledgment after switching accounts', async () => {
  let finish!: (value: unknown) => void;
  const { wrapper } = fixture();
  const hook = renderHook(() => ({ read: useUserPreferences(), save: useUpdatePreferences() }), { wrapper });
  await waitFor(() => expect(hook.result.current.read.isSuccess).toBe(true));
  state.write.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  let saving!: Promise<unknown>;
  act(() => { saving = hook.result.current.save.mutateAsync({ button_sound: 'click' }); });
  await waitFor(() => expect(state.write).toHaveBeenCalled());
  state.session = { uid: 'bob', epoch: 2 };
  await act(async () => { finish({ error: null }); await expect(saving).rejects.toThrow('Account changed'); });
  expect(JSON.parse(localStorage.getItem('vybe_user_prefs_cache:alice:migrated-alice')!).button_sound).toBe('pop');
});
it('keeps other preferences and both devices appearance settings when synchronizing widget order', async () => {
  state.read.mockResolvedValue({ data: { extra: {
    color: 'blue', grid_layout: {
      mobile: { font_body: 'Mobile font', background_url: '/mobile.webp' },
      desktop: { font_body: 'Desktop font', background_url: '/desktop.webp' },
    },
  } }, error: null });
  const { wrapper, client } = fixture(); const hook = renderHook(useGridLayout, { wrapper });
  await waitFor(() => expect(hook.result.current.preferences.isSuccess).toBe(true));
  const widgets = hook.result.current.config.widgets.map(w => ({ ...w, enabled: w.id === 'wallet' || w.id === 'feed', order: w.id === 'wallet' ? 0 : 1 }));
  await act(async () => { await hook.result.current.saveGridLayout({ widgets }, true); });
  const payload = state.write.mock.calls[0][0];
  expect(payload.extra.grid_layout.mobile.font_body).toBe('Mobile font');
  expect(payload.extra.grid_layout.desktop.font_body).toBe('Desktop font');
  expect(payload.extra.home_layout.order).toEqual(['wallet', 'feed']);
  expect(payload.extra).not.toHaveProperty('color'); // Firestore merge leaves unrelated server fields untouched.
  expect((client.getQueryData(key()) as any).extra.color).toBe('blue');
});
it('blocks cached/default layout saves when the server read fails', async () => {
  localStorage.setItem('vybe_user_prefs_cache:alice:migrated-alice', JSON.stringify({ extra: { color: 'blue' } }));
  state.read.mockResolvedValue({ data: null, error: new Error('Unavailable') });
  const { wrapper } = fixture(); const hook = renderHook(useGridLayout, { wrapper });
  await waitFor(() => expect(hook.result.current.preferences.isError).toBe(true));
  await expect(hook.result.current.saveGridLayout({ widgets: [] }, true)).rejects.toThrow('still loading');
  expect(state.write).not.toHaveBeenCalled();
});
it('restores a legacy layout and safely ignores corrupt widget spans and metadata', async () => {
  state.read.mockResolvedValue({ data: { extra: { home_layout: { order: ['wallet', 'feed'], hidden: ['greeting', 'stories'] }, grid_layout: { mobile: { widgets: { bad: true } } } } }, error: null });
  const { wrapper } = fixture(); const hook = renderHook(useGridLayout, { wrapper });
  await waitFor(() => expect(hook.result.current.preferences.isSuccess).toBe(true));
  expect(hook.result.current.config.widgets.filter(w => w.enabled).map(w => w.id)).toEqual(['wallet', 'feed']);
});
it('updates an imported preference row in place instead of creating a duplicate', async () => {
  state.read.mockResolvedValue({ data: { id: 'imported-preference-row', extra: { color: 'blue' } }, error: null });
  const { wrapper } = fixture();
  const hook = renderHook(() => ({ read: useUserPreferences(), save: useUpdatePreferences() }), { wrapper });
  await waitFor(() => expect(hook.result.current.read.isSuccess).toBe(true));
  await act(async () => { await hook.result.current.save.mutateAsync({ button_sound: 'click' }); });
  expect(state.write.mock.calls[0][0]).toMatchObject({ id: 'imported-preference-row', user_id: 'migrated-alice', button_sound: 'click' });
});
