import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, ready: true, mute: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, ready: state.ready, session: { uid, epoch }, guard: () => { if (uid !== state.uid || epoch !== state.epoch || !state.ready) throw new Error('Changed account'); } };
} }));
vi.mock('@/lib/notificationPreferenceService', () => ({ muteSmartPingsForOneHour: state.mute }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import { SmartPingBridge } from './SmartPingBridge';
let worker: EventTarget, client: QueryClient;
const view = () => <QueryClientProvider client={client}><SmartPingBridge /></QueryClientProvider>;
const message = (hours = 1, recipientUid: string | undefined = 'alice') => worker.dispatchEvent(new MessageEvent('message', { data: { type: 'MUTE_SMART_PINGS', hours, recipientUid } }));
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch = 1; state.ready = true; worker = new EventTarget(); Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: worker }); client = new QueryClient(); });
afterEach(() => { cleanup(); client.clear(); });
it('makes an explicit one-hour request for the bound profile and confirms only its receipt', async () => {
  state.mute.mockResolvedValue({ preferences: { brief_muted_until: Date.now() + 3600000 } }); render(view());
  act(() => message()); await waitFor(() => expect(state.success).toHaveBeenCalled());
  expect(state.mute).toHaveBeenCalledWith({ uid: 'alice', profileId: 'profile-alice' }, expect.any(Function));
  act(() => message(24)); expect(state.mute).toHaveBeenCalledTimes(1);
});
it('reports a real failure without a success acknowledgement', async () => {
  state.mute.mockRejectedValue(new Error('Changed on another device')); render(view()); act(() => message());
  await waitFor(() => expect(state.error).toHaveBeenCalledWith('Changed on another device')); expect(state.success).not.toHaveBeenCalled();
});
it('ignores duplicate pending clicks and stale A-B-A completion', async () => {
  let finish!: (value: unknown) => void; state.mute.mockReturnValue(new Promise(resolve => { finish = resolve; })); const rendered = render(view());
  act(() => { message(); message(); }); expect(state.mute).toHaveBeenCalledTimes(1);
  state.uid = 'bob'; state.epoch++; rendered.rerender(view()); state.uid = 'alice'; state.epoch++; rendered.rerender(view());
  await act(async () => { finish({ preferences: { brief_muted_until: Date.now() + 3600000 } }); });
  expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
});
it('suppresses pending failure after unmount and does not process messages before auth is ready', async () => {
  state.ready = false; const rendered = render(view()); act(() => message()); expect(state.mute).not.toHaveBeenCalled(); state.error.mockClear();
  state.ready = true; rendered.rerender(view()); let reject!: (error: Error) => void; state.mute.mockReturnValue(new Promise((_, failure) => { reject = failure; })); act(() => message()); rendered.unmount();
  await act(async () => reject(new Error('Offline'))); expect(state.error).not.toHaveBeenCalled();
});
it('rejects another recipient and old notifications with no account binding', () => {
  render(view()); act(() => { message(1, 'bob'); worker.dispatchEvent(new MessageEvent('message', { data: { type: 'MUTE_SMART_PINGS', hours: 1 } })); });
  expect(state.mute).not.toHaveBeenCalled(); expect(state.error).toHaveBeenCalledTimes(2); expect(state.error).toHaveBeenCalledWith(expect.stringContaining('account that received'));
});
