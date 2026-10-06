import { useRef } from 'react';
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
