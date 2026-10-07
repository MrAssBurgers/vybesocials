import { StrictMode, useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useClipMediaSource } from './useClipMediaSource';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function Player({ active, url }: { active: boolean; url: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const source = useClipMediaSource(ref, url, active);
  return <video ref={ref} src={source} preload="none" />;
}
it('releases the departed clip buffer and never attaches cached URLs to inactive clips', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const url = 'https://example.test/clip.mp4';
  const view = render(<Player active={false} url={url} />);
  const video = view.container.querySelector('video')!;
  expect(video.hasAttribute('src')).toBe(false); expect(load).not.toHaveBeenCalled();
  view.rerender(<Player active url={url} />);
  expect(video.getAttribute('src')).toBe(url);
  view.rerender(<Player active={false} url={url} />);
  expect(video.hasAttribute('src')).toBe(false); expect(pause).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledOnce();
  view.rerender(<Player active={false} url="https://example.test/other.mp4" />);
  expect(load).toHaveBeenCalledOnce(); expect(video.hasAttribute('src')).toBe(false);
  view.rerender(<Player active url={url} />);
  expect(video.getAttribute('src')).toBe(url);
});
it('releases a still-active decoder when its card unmounts directly', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const view = render(<Player active url="https://example.test/clip.mp4" />);
  const video = view.container.querySelector('video')!;
  view.unmount();
  expect(video.hasAttribute('src')).toBe(false);
  expect(pause).toHaveBeenCalledOnce(); expect(load).toHaveBeenCalledOnce();
});
it('does not release an inactive or already released decoder again on unmount', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const idle = render(<Player active={false} url="https://example.test/idle.mp4" />);
  idle.unmount(); expect(load).not.toHaveBeenCalled(); expect(pause).not.toHaveBeenCalled();
  const view = render(<Player active url="https://example.test/clip.mp4" />);
  view.rerender(<Player active={false} url="https://example.test/clip.mp4" />);
  view.unmount(); expect(load).toHaveBeenCalledOnce(); expect(pause).toHaveBeenCalledOnce();
});
it('restores the authorized active source after StrictMode cleanup and releases it on final unmount', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const url = 'https://example.test/clip.mp4';
  const view = render(<StrictMode><Player active url={url} /></StrictMode>);
  const video = view.container.querySelector('video')!;
  expect(video.getAttribute('src')).toBe(url);
  expect(load).toHaveBeenCalledOnce(); expect(pause).toHaveBeenCalledOnce();
  view.unmount();
  expect(video.hasAttribute('src')).toBe(false);
  expect(load).toHaveBeenCalledTimes(2); expect(pause).toHaveBeenCalledTimes(2);
});
