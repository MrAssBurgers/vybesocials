import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipVideoProgress } from './ClipVideoProgress';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('clip progress lifecycle', () => {
  it('never intercepts cross-origin audio and stops work for paused, hidden or retired players', () => {
    const processor = vi.fn(); vi.stubGlobal('AudioContext', processor);
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const video = document.createElement('video'); video.src = 'https://example.test/clip';
    let paused = true, visibility = 'visible';
    Object.defineProperty(video, 'paused', { get: () => paused });
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState);
    const view = render(<ClipVideoProgress videoRef={{ current: video }} isActive isMuted={false} />);
    expect(processor).not.toHaveBeenCalled(); expect(frames).not.toHaveBeenCalled();
    paused = false; video.dispatchEvent(new Event('play'));
    expect(frames).toHaveBeenCalledOnce();
    visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    expect(cancel).toHaveBeenCalledWith(42); expect(frames).toHaveBeenCalledOnce();
    visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    expect(frames).toHaveBeenCalledTimes(2);
    paused = true; video.dispatchEvent(new Event('pause'));
    expect(frames).toHaveBeenCalledTimes(2);
    view.unmount(); paused = false; video.dispatchEvent(new Event('play'));
    expect(frames).toHaveBeenCalledTimes(2); expect(processor).not.toHaveBeenCalled();
  });
});
