import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const auth = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 } }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => auth.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => auth.session, reportAccountGuard: (uid: string) => { const epoch = auth.session.epoch; return () => { if (uid !== auth.session.uid || epoch !== auth.session.epoch) throw new Error('account changed'); }; } }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
import { useMusicPlayback } from './useMusicPlayback';
class FakeAudio extends EventTarget {
  static instances: FakeAudio[] = [];
  static nextPlay: (() => Promise<void>) | null = null;
  currentTime = 0; duration = 60; volume = 1; muted = false; preload = ''; src: string;
  play = vi.fn(() => FakeAudio.nextPlay ? FakeAudio.nextPlay() : Promise.resolve());
  pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn();
  constructor(src: string) { super(); this.src = src; FakeAudio.instances.push(this); }
}
beforeEach(() => { auth.session = { uid: 'alice', epoch: 1 }; FakeAudio.instances = []; FakeAudio.nextPlay = null; vi.stubGlobal('Audio', FakeAudio); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('explicit music playback lifecycle', () => {
  it('does not autoplay and waits for an actual play receipt', async () => {
    let resolve!: () => void; FakeAudio.nextPlay = () => new Promise(yes => { resolve = yes; });
    const { result } = renderHook(() => useMusicPlayback('/sounds/comment.wav', 30));
    expect(FakeAudio.instances).toHaveLength(0);
    let playing!: Promise<void>; act(() => { playing = result.current.play(); });
    expect(result.current.isLoading).toBe(true); expect(result.current.isPlaying).toBe(false);
    await act(async () => { resolve(); await playing; }); expect(result.current.isPlaying).toBe(true);
  });
  it('shows playback rejection and retries on a new explicit press', async () => {
    FakeAudio.nextPlay = () => Promise.reject(new Error('autoplay refused'));
    const { result } = renderHook(() => useMusicPlayback('/sounds/comment.wav'));
    await act(() => result.current.play()); expect(result.current.isPlaying).toBe(false); expect(result.current.error).toMatch(/did not start/);
    FakeAudio.nextPlay = null; await act(() => result.current.play()); expect(result.current.isPlaying).toBe(true); expect(result.current.error).toBe('');
  });
  it('stops pending old-source playback before and after late completion', async () => {
    let resolve!: () => void; FakeAudio.nextPlay = () => new Promise(yes => { resolve = yes; });
    const { result, rerender } = renderHook(({ source }) => useMusicPlayback(source), { initialProps: { source: '/sounds/comment.wav' } });
    let pending!: Promise<void>; act(() => { pending = result.current.play(); }); const old = FakeAudio.instances[0];
    rerender({ source: '' }); expect(old.pause).toHaveBeenCalled();
    await act(async () => { resolve(); await pending; }); expect(result.current.isPlaying).toBe(false); expect(result.current.isLoaded).toBe(false); expect(old.pause.mock.calls.length).toBeGreaterThan(1);
  });
  it('stops and masks on A-B-A account epochs and ignores old events', async () => {
    const { result, rerender } = renderHook(() => useMusicPlayback('/sounds/comment.wav'));
    await act(() => result.current.play()); const old = FakeAudio.instances[0];
    auth.session = { uid: 'alice', epoch: 3 }; rerender();
    act(() => { old.currentTime = 18; old.dispatchEvent(new Event('timeupdate')); });
    expect(result.current.isPlaying).toBe(false); expect(result.current.currentTime).toBe(0); expect(old.removeAttribute).toHaveBeenCalledWith('src');
  });
  it('refuses a hidden start, tears down on pagehide and never resumes automatically', async () => {
    const { result } = renderHook(() => useMusicPlayback('/sounds/comment.wav'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); await act(() => result.current.play()); expect(FakeAudio.instances).toHaveLength(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); await act(() => result.current.play());
    act(() => window.dispatchEvent(new Event('pagehide'))); expect(result.current.isPlaying).toBe(false);
    act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(FakeAudio.instances).toHaveLength(1);
  });
  it('applies real volume/mute, clamps seek and caps preview playback', async () => {
    vi.useFakeTimers(); const { result } = renderHook(() => useMusicPlayback('/sounds/comment.wav', 30));
    await act(() => result.current.play()); const audio = FakeAudio.instances[0];
    act(() => { audio.dispatchEvent(new Event('loadedmetadata')); result.current.setVolume(0.25); result.current.setMuted(true); result.current.seek(90); });
    expect(audio.volume).toBe(0.25); expect(audio.muted).toBe(true); expect(audio.currentTime).toBe(30); expect(result.current.duration).toBe(30);
    act(() => vi.advanceTimersByTime(30000)); expect(result.current.isPlaying).toBe(false);
  });
  it('keeps pause position on explicit resume and cleans up on unmount', async () => {
    const { result, unmount } = renderHook(() => useMusicPlayback('/sounds/comment.wav'));
    await act(() => result.current.play()); act(() => { FakeAudio.instances[0].currentTime = 4; result.current.pause(); });
    await act(() => result.current.play()); const next = FakeAudio.instances[1]; act(() => next.dispatchEvent(new Event('loadedmetadata'))); expect(next.currentTime).toBe(4);
    unmount(); expect(next.pause).toHaveBeenCalled(); expect(next.load).toHaveBeenCalled();
  });
  it('times out a stalled load and rejects missing/unsafe sources without Audio', async () => {
    vi.useFakeTimers(); FakeAudio.nextPlay = () => new Promise(() => {});
    const { result, rerender } = renderHook(({ source }) => useMusicPlayback(source), { initialProps: { source: '/sounds/comment.wav' } });
    act(() => { void result.current.play(); }); act(() => vi.advanceTimersByTime(15000)); expect(result.current.error).toMatch(/too long/); expect(result.current.isLoading).toBe(false);
    rerender({ source: 'javascript:alert(1)' }); await act(() => result.current.play()); expect(FakeAudio.instances).toHaveLength(1); expect(result.current.error).toMatch(/No playable/);
  });
  it('a captured old Play callback cannot initiate after an unrendered A-B-A transition', async () => {
    const { result } = renderHook(() => useMusicPlayback('/sounds/comment.wav'));
    const oldPlay = result.current.play; auth.session = { uid: 'alice', epoch: 3 };
    await act(oldPlay); expect(FakeAudio.instances).toHaveLength(0);
  });
  it('starting a second player stops the first, including pending playback', async () => {
    let resolve!: () => void; FakeAudio.nextPlay = () => new Promise(yes => { resolve = yes; });
    const first = renderHook(() => useMusicPlayback('/sounds/comment.wav'));
    const second = renderHook(() => useMusicPlayback('/sounds/dm-sent.wav'));
    let pending!: Promise<void>; act(() => { pending = first.result.current.play(); }); const old = FakeAudio.instances[0];
    FakeAudio.nextPlay = null; await act(() => second.result.current.play()); expect(first.result.current.isPlaying).toBe(false); expect(old.pause).toHaveBeenCalled();
    await act(async () => { resolve(); await pending; }); expect(second.result.current.isPlaying).toBe(true); expect(first.result.current.isPlaying).toBe(false);
  });
});
