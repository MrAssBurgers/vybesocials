import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', profile: 'profile-alice', account: { uid: 'alice', epoch: 1 }, listeners: new Set<() => void>(), read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: state.profile } }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.account,
  reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
  reportAccountGuard: (uid: string) => { const epoch = state.account.epoch; return () => { if (state.account.uid !== uid || state.account.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; },
}));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => state.read() }) }),
  upsert: (body: unknown) => { state.write(body); return { select: () => ({ single: () => Promise.resolve({ data: body, error: null }) }) }; },
}) } }));
import { useSafetySettings, useUpdateSafetySettings } from './useSafetySettings';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { state.uid = 'alice'; state.profile = 'profile-alice'; state.account = { uid: 'alice', epoch: 1 }; state.read.mockReset().mockResolvedValue({ data: null, error: null }); state.write.mockClear(); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); onlineManager.setOnline(true); });
const change = () => { state.uid = 'bob'; state.profile = 'profile-bob'; state.account = { uid: 'bob', epoch: 2 }; for (const notify of state.listeners) notify(); };
describe('safety settings account scope and saves', () => {
  it('refuses identity fields before starting a save', async () => {
    const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ user_id: 'bob', dm_filter: 'nobody' } as never)).rejects.toThrow(); });
    expect(state.write).not.toHaveBeenCalled();
  });
  it('rejects a late read for a retired account', async () => {
    let resolve!: (value: unknown) => void; state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(() => useSafetySettings(), { wrapper });
    await waitFor(() => expect(state.read).toHaveBeenCalled()); state.account = { uid: 'bob', epoch: 2 };
    await act(async () => { resolve({ data: { user_id: 'profile-alice', dm_filter: 'everyone' }, error: null }); });
    expect(client.getQueryData(['safety-settings', 'profile-alice', 1])).toBeUndefined();
    await waitFor(() => expect(client.getQueryState(['safety-settings', 'profile-alice', 1])?.error).toMatchObject({ code: 'account-changed' }));
    expect(hook.result.current.data).toBeUndefined();
  });
  it('preserves the existing row ID and creation history', async () => {
    state.read.mockResolvedValue({ data: { id: 'legacy-row', user_id: 'profile-alice', created_at: '2020-01-01' }, error: null });
    const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync({ dm_filter: 'nobody' }); });
    expect(state.write).toHaveBeenCalledWith(expect.objectContaining({ id: 'legacy-row', user_id: 'profile-alice', created_at: '2020-01-01', dm_filter: 'nobody' }));
  });
  it('does not write if the account changes during the existing-row check', async () => {
    let resolve!: (value: unknown) => void; state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(() => useUpdateSafetySettings(), { wrapper }); let pending!: Promise<unknown>;
    await act(async () => { pending = hook.result.current.mutateAsync({ dm_filter: 'nobody' }); }); change();
    await act(async () => { resolve({ data: null, error: null }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(state.write).not.toHaveBeenCalled();
  });
  it('refuses offline saves rather than queuing them to replay later', async () => {
    onlineManager.setOnline(false); const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ dm_filter: 'nobody' })).rejects.toThrow('Connect'); });
    expect(state.write).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(false);
  });
  it('does not overwrite a row belonging to another profile', async () => {
    state.read.mockResolvedValue({ data: { id: 'other', user_id: 'profile-bob' }, error: null });
    const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ dm_filter: 'nobody' })).rejects.toThrow(); }); expect(state.write).not.toHaveBeenCalled();
  });
});
