import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSoundPreview } from './useSoundPreview';
import { writeDevicePreference } from '@/lib/devicePreferences';

const mock = vi.hoisted(() => ({
  play: vi.fn(), prepare: vi.fn(), settings: { master: true, messages: true, calls: true, ui: false, volume: 72 },
  session: { uid: 'alice', epoch: 1 },
}));
vi.mock('@/lib/premiumSounds', () => ({ playCustomAudio: mock.play, prepareSoundPreview: mock.prepare, getSoundSettings: () => mock.settings }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => mock.session }));
beforeEach(() => {
  vi.clearAllMocks(); mock.settings.master = true;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('never autoplays and stops the previous preview when another starts', async () => {
  const firstStop = vi.fn(), secondStop = vi.fn();
  mock.play.mockResolvedValueOnce({ stop: firstStop }).mockResolvedValueOnce({ stop: secondStop });
  const first = renderHook(useSoundPreview), second = renderHook(useSoundPreview);
  expect(mock.play).not.toHaveBeenCalled();
  expect(mock.prepare).not.toHaveBeenCalled();
  await act(() => first.result.current.play('/message.wav', 'messages'));
  expect(mock.play).toHaveBeenCalledWith('/message.wav', false, undefined, 'messages', expect.any(Function), expect.any(Function));
  expect(mock.prepare.mock.invocationCallOrder[0]).toBeLessThan(mock.play.mock.invocationCallOrder[0]);
  await act(() => second.result.current.play('/ring.wav', 'calls'));
  expect(firstStop).toHaveBeenCalledOnce(); expect(first.result.current.state).toBe('idle');
  second.unmount(); expect(secondStop).toHaveBeenCalledOnce();
});

it('cancels late downloads after Stop, mute and account changes', async () => {
  for (const reason of ['stop', 'mute', 'account'] as const) {
    let finish!: (value: { stop: () => void }) => void;
    mock.play.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const hook = renderHook(useSoundPreview);
    act(() => { void hook.result.current.play('/slow.wav', 'messages'); });
    const cancelled = mock.play.mock.calls.at(-1)![4] as () => boolean;
    act(() => {
      if (reason === 'stop') hook.result.current.stop();
      if (reason === 'mute') { mock.settings.master = false; writeDevicePreference('vybe-sound-settings', '{}'); }
      if (reason === 'account') mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 };
    });
    if (reason === 'account') hook.rerender();
    expect(cancelled()).toBe(true);
    const stop = vi.fn(); await act(async () => finish({ stop }));
    expect(stop).toHaveBeenCalledOnce(); expect(hook.result.current.state).toBe('idle');
    hook.unmount(); mock.settings.master = true;
  }
});

it('reflects natural completion and playback refusal truthfully', async () => {
  mock.play.mockResolvedValueOnce({ stop: vi.fn() }).mockResolvedValueOnce(null);
  const hook = renderHook(useSoundPreview);
  await act(() => hook.result.current.play('/ok.wav', 'messages'));
  expect(hook.result.current.state).toBe('playing');
  act(() => mock.play.mock.calls[0][5]());
  expect(hook.result.current.state).toBe('idle');
  await act(() => hook.result.current.play('/blocked.wav', 'messages'));
  expect(hook.result.current.state).toBe('idle'); expect(hook.result.current.error).toContain('could not play');
});

it('clears Loading and permits retry if audio setup rejects', async () => {
  mock.play.mockRejectedValueOnce(new Error('Audio unavailable')).mockResolvedValueOnce({ stop: vi.fn() });
  const hook = renderHook(useSoundPreview);
  await act(() => hook.result.current.play('/error.wav', 'messages'));
  expect(hook.result.current.state).toBe('idle'); expect(hook.result.current.error).toContain('could not play');
  await act(() => hook.result.current.play('/retry.wav', 'messages'));
  expect(hook.result.current.state).toBe('playing'); expect(hook.result.current.error).toBeNull();
});

it('bounds long samples and pending downloads, and stops when the page hides', async () => {
  vi.useFakeTimers();
  const stop = vi.fn(); mock.play.mockResolvedValue({ stop });
  const hook = renderHook(useSoundPreview);
  await act(() => hook.result.current.play('/long.wav', 'calls'));
  act(() => vi.advanceTimersByTime(8_000)); expect(stop).toHaveBeenCalledOnce();
  await act(() => hook.result.current.play('/hide.wav', 'calls'));
  act(() => window.dispatchEvent(new Event('pagehide')));
  expect(stop).toHaveBeenCalledTimes(2);
  mock.play.mockReturnValue(new Promise(() => {}));
  act(() => { void hook.result.current.play('/stalled.wav', 'messages'); });
  act(() => vi.advanceTimersByTime(15_000));
  expect(hook.result.current.state).toBe('idle'); expect(hook.result.current.error).toContain('too long');
});
