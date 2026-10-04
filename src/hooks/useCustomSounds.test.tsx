import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAudioDuration, useCustomSounds, useDeleteCustomSound, useSyncCustomSounds, useUploadCustomSound } from './useCustomSounds';
import { StrictMode, useLayoutEffect, type ReactNode } from 'react';

const mock = vi.hoisted(() => ({
  session: { uid: 'alice', epoch: 1 }, auth: { user: { id: 'alice' }, profile: { id: 'profile-alice', user_id: 'alice' } },
  read: vi.fn(), removeRow: vi.fn(), upsert: vi.fn(), upload: vi.fn(), signed: vi.fn(), removeFile: vi.fn(),
  setTone: vi.fn(), clearTone: vi.fn(), success: vi.fn(), error: vi.fn(),
  local: {} as Record<string, string>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => mock.auth }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => mock.session }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => mock.session,
  reportAccountGuard: (uid: string) => { const started = mock.session; return () => { if (mock.session !== started || uid !== mock.session.uid) throw new Error('account changed'); }; },
}));
vi.mock('@/lib/premiumSounds', () => ({ updateCustomSounds: mock.setTone, clearCustomSound: mock.clearTone, getCustomSounds: () => mock.local }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock('@/lib/firebase', () => ({ db: {
  from: () => ({
    select: () => ({ eq: mock.read }),
    delete: () => ({ eq: () => ({ eq: mock.removeRow }) }),
    upsert: (row: unknown) => ({ select: () => ({ single: () => mock.upsert(row) }) }),
  }),
  storage: { from: () => ({ upload: mock.upload, createSignedUrl: mock.signed, remove: mock.removeFile }) },
} }));

const audios: FakeAudio[] = [];
class FakeAudio extends EventTarget {
  duration = 3; src = ''; preload = '';
  removeAttribute = vi.fn();
  constructor() { super(); audios.push(this); }
}
const file = new File(['sound'], 'chime.wav', { type: 'audio/wav' });
const revoke = vi.fn();
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
beforeEach(() => {
  vi.clearAllMocks(); audios.length = 0;
  mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 };
  mock.auth = { user: { id: 'alice' }, profile: { id: 'profile-alice', user_id: 'alice' } };
  mock.local = {};
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('URL', class extends URL { static createObjectURL = () => 'blob:metadata'; static revokeObjectURL = revoke; });
  mock.read.mockResolvedValue({ data: [], error: null });
  mock.upload.mockResolvedValue({ error: null });
  mock.signed.mockResolvedValue({ data: { signedUrl: 'https://storage.test/chime.wav?token=test' }, error: null });
  mock.upsert.mockImplementation(async row => ({ data: { id: 'tone', ...row }, error: null }));
  mock.removeRow.mockResolvedValue({ error: null }); mock.removeFile.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('releases metadata URLs on success, malformed duration and timeout', async () => {
  const good = getAudioDuration(file); audios.at(-1)!.dispatchEvent(new Event('loadedmetadata'));
  await expect(good).resolves.toBe(3); expect(revoke).toHaveBeenCalledOnce();
  const bad = getAudioDuration(file); audios.at(-1)!.duration = Infinity;
  audios.at(-1)!.dispatchEvent(new Event('loadedmetadata'));
  await expect(bad).rejects.toThrow('duration'); expect(revoke).toHaveBeenCalledTimes(2);
  vi.useFakeTimers(); const timed = getAudioDuration(file); const assertion = expect(timed).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(15_000); await assertion; expect(revoke).toHaveBeenCalledTimes(3);
});

it('clears only missing confirmed tones and keeps local choices on a failed read', async () => {
  mock.local = { message_tone: '/saved.wav' };
  const first = renderHook(useSyncCustomSounds, wrapper());
  await waitFor(() => expect(mock.clearTone).toHaveBeenCalledWith('message_tone'));
  first.unmount(); mock.clearTone.mockClear(); mock.read.mockResolvedValue({ data: null, error: new Error('offline') });
  renderHook(useSyncCustomSounds, wrapper());
  await waitFor(() => expect(mock.read).toHaveBeenCalledTimes(2));
  expect(mock.clearTone).not.toHaveBeenCalled(); expect(mock.setTone).not.toHaveBeenCalled();
});

it('rejects stale React profile ownership before a custom-tone request', async () => {
  mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 };
  const hook = renderHook(useUploadCustomSound, wrapper());
  await act(async () => { await expect(hook.result.current.mutateAsync({ file, soundType: 'message_tone' })).rejects.toThrow('account changed'); });
  expect(audios).toHaveLength(0); expect(mock.upload).not.toHaveBeenCalled();
});

it('saves an owned upload with a fresh playback revision and exact cache invalidation', async () => {
  const setup = wrapper(); const invalidate = vi.spyOn(setup.client, 'invalidateQueries');
  const hook = renderHook(useUploadCustomSound, setup);
  let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.mutateAsync({ file, soundType: 'message_tone' }); });
  await waitFor(() => expect(audios).toHaveLength(1));
  await act(async () => { audios[0].dispatchEvent(new Event('loadedmetadata')); await pending; });
  expect(mock.upload).toHaveBeenCalledWith('alice/message_tone.wav', file, { upsert: true, contentType: 'audio/wav' });
  expect(mock.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'profile-alice', file_url: expect.stringContaining('vybe-tone=') }));
  expect(mock.setTone).toHaveBeenCalledOnce(); expect(mock.success).toHaveBeenCalledOnce();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['custom-sounds', 'alice', mock.session.epoch, 'profile-alice'] });
});

it('does not continue an upload into another account after storage resolves', async () => {
  let finish!: (value: unknown) => void; mock.upload.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(useUploadCustomSound, wrapper());
  let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.mutateAsync({ file, soundType: 'call_ringtone' }); });
  const rejected = expect(pending).rejects.toThrow('account changed');
  await waitFor(() => expect(audios).toHaveLength(1));
  act(() => audios[0].dispatchEvent(new Event('loadedmetadata')));
  await waitFor(() => expect(mock.upload).toHaveBeenCalled());
  mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; hook.rerender();
  await act(async () => { finish({ error: null }); await rejected; });
  expect(mock.signed).not.toHaveBeenCalled(); expect(mock.upsert).not.toHaveBeenCalled();
  expect(mock.setTone).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
});

it('does not clear a new account tone or remove files after an old deletion completes', async () => {
  let finish!: (value: unknown) => void; mock.removeRow.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(useDeleteCustomSound, wrapper());
  let pending!: Promise<unknown>; act(() => { pending = hook.result.current.mutateAsync('message_tone'); });
  const rejected = expect(pending).rejects.toThrow('account changed');
  await waitFor(() => expect(mock.removeRow).toHaveBeenCalled());
  mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; hook.rerender();
  await act(async () => { finish({ error: null }); await rejected; });
  expect(mock.clearTone).not.toHaveBeenCalled(); expect(mock.removeFile).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled();
});

it('discards a late query after an account ABA instead of synchronizing old URLs', async () => {
  let finish!: (value: unknown) => void; mock.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(useCustomSounds, wrapper());
  await waitFor(() => expect(mock.read).toHaveBeenCalledOnce());
  mock.session = { uid: 'alice', epoch: mock.session.epoch + 2 }; hook.rerender();
  await act(async () => finish({ data: [{ id: 'old', user_id: 'profile-alice', sound_type: 'message_tone', file_url: '/old.wav', file_name: 'old', duration_seconds: 3 }], error: null }));
  await waitFor(() => expect(hook.result.current.data).toEqual([]));
});

it('loads owned custom tones through the app StrictMode mount cycle', async () => {
  const setup = wrapper(); const Provider = setup.wrapper;
  const hook = renderHook(useCustomSounds, { wrapper: ({ children }) => <StrictMode><Provider>{children}</Provider></StrictMode> });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.data).toEqual([]);
});

it('skips cached tone synchronization when Auth changes before passive effects', () => {
  const setup = wrapper(); const Provider = setup.wrapper;
  setup.client.setQueryData(['custom-sounds', 'alice', mock.session.epoch, 'profile-alice'], [{
    id: 'saved', user_id: 'profile-alice', sound_type: 'message_tone', file_url: '/alice.wav', file_name: 'Alice', duration_seconds: 2,
  }]);
  function SwitchBeforeEffects({ children }: { children: ReactNode }) {
    useLayoutEffect(() => { mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; }, []);
    return <Provider>{children}</Provider>;
  }
  expect(() => renderHook(useSyncCustomSounds, { wrapper: SwitchBeforeEffects })).not.toThrow();
  expect(mock.setTone).not.toHaveBeenCalled(); expect(mock.clearTone).not.toHaveBeenCalled();
});
