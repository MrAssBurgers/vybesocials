import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', profile: 'profile-alice', account: { uid: 'alice', epoch: 1 }, listeners: new Set<() => void>(), read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: state.profile, user_id: state.uid } }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.account,
  reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
  reportAccountGuard: (uid: string) => { const epoch = state.account.epoch; return () => { if (state.account.uid !== uid || state.account.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; },
}));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => state.read() }) }),
  upsert: (body: unknown) => { state.write(body); return { select: () => ({ single: () => Promise.resolve({ data: body, error: null }) }) }; },
}) } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: { uid: state.uid, metadata: { creationTime: '2026-01-01T00:00:00Z' } } }) }));
vi.mock('firebase/app', () => ({ getApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: (_fns: unknown, name: string) => { if (name !== 'updateSafetySettings') throw new Error('Wrong endpoint'); return state.write; } }));
import { useSafetySettings, useUpdateSafetySettings } from './useSafetySettings';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { state.uid = 'alice'; state.profile = 'profile-alice'; state.account = { uid: 'alice', epoch: 1 }; state.read.mockReset().mockResolvedValue({ data: null, error: null }); state.write.mockReset().mockImplementation(async (body) => ({ data: { ok: true, settings: { id: 'legacy-row', user_id: body.expectedProfileId, created_at: '2020-01-01', ...body.updates } } })); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); });
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
    expect(client.getQueryData(['safety-settings', 'profile-alice', 1, '2026-01-01T00:00:00Z'])).toBeUndefined();
    await waitFor(() => expect(client.getQueryState(['safety-settings', 'profile-alice', 1, '2026-01-01T00:00:00Z'])?.error).toMatchObject({ code: 'account-changed' }));
    expect(hook.result.current.data).toBeUndefined();
  });
  it('sends only validated edits and captured current-account authority to the server', async () => {
    const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync({ dm_filter: 'nobody' }); });
    expect(state.write).toHaveBeenCalledExactlyOnceWith({ updates: { dm_filter: 'nobody' }, expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: Date.parse('2026-01-01T00:00:00Z') });
    expect(state.read).not.toHaveBeenCalled();
  });
  it('ignores a late save acknowledgment after account replacement', async () => {
    let resolve!: (value: unknown) => void; state.write.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(() => useUpdateSafetySettings(), { wrapper }); let pending!: Promise<unknown>;
    await act(async () => { pending = hook.result.current.mutateAsync({ dm_filter: 'nobody' }); }); change();
    await act(async () => { resolve({ data: { ok: true, settings: { id: 'row', user_id: 'profile-alice' } } }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(state.write).toHaveBeenCalledOnce();
  });
  it('refuses offline saves rather than queuing them to replay later', async () => {
    onlineManager.setOnline(false); const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ dm_filter: 'nobody' })).rejects.toThrow('Connect'); });
    expect(state.write).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()[0]?.state.isPaused).toBe(false);
  });
  it('rejects an acknowledgment belonging to another profile', async () => {
    state.write.mockResolvedValue({ data: { ok: true, settings: { id: 'other', user_id: 'profile-bob' } } });
    const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ dm_filter: 'nobody' })).rejects.toThrow('ownership'); });
  });
  it('sends PIN proof only for its current account epoch', async () => {
    const hook = renderHook(() => useUpdateSafetySettings({ uid: 'alice', epoch: 1, pin: '1234' }), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync({ dm_filter: 'nobody' }); });
    expect(state.write.mock.calls[0][0]).toMatchObject({ pin: '1234' });
    state.account = { uid: 'alice', epoch: 2 }; hook.rerender();
    await act(async () => { await expect(hook.result.current.mutateAsync({ dm_filter: 'nobody' })).rejects.toThrow('Unlock'); });
    expect(state.write).toHaveBeenCalledOnce();
  });
  it('does not accept missing save confirmation or retry it automatically', async () => {
    state.write.mockResolvedValue({ data: {} }); const hook = renderHook(() => useUpdateSafetySettings(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ dm_filter: 'nobody' })).rejects.toThrow('incomplete'); });
    expect(state.write).toHaveBeenCalledOnce();
  });
});
