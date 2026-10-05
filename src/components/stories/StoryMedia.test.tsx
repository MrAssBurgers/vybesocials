import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ resolved: undefined as string | null | undefined }));
// Model a resolver that may retain its initial result until an async replacement.
// The source-keyed media lifecycle must never render that old result for a new story.
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: (url: string | null) => {
  const [initial] = useState(url); return state.resolved === undefined ? initial : state.resolved;
} }));
import { StoryMedia } from './StoryMedia';
const imageProps = { mediaUrl: 'https://media.test/first.jpg', mediaType: 'image' };
const decode = (image: HTMLImageElement) => { Object.defineProperty(image, 'naturalWidth', { value: 1 }); fireEvent.load(image); };
beforeEach(() => {
  state.resolved = undefined; vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Story media display and playback', () => {
  it('waits for image decode, accepts a valid one-pixel fixture and retries a failed image', () => {
    const ready = vi.fn(); const view = render(<StoryMedia {...imageProps} onReadyChange={ready} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading story'); expect(ready).toHaveBeenLastCalledWith(false);
    const failed = view.container.querySelector('img')!; fireEvent.error(failed);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded'); expect(view.container.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry story media' }));
    const retried = view.container.querySelector('img')!; expect(retried).not.toBe(failed); expect(retried.src).toBe(imageProps.mediaUrl);
    decode(retried); expect(ready).toHaveBeenLastCalledWith(true); expect(retried.style.opacity).toBe('1');
    expect(screen.queryByRole('alert')).toBeNull(); expect(screen.queryByRole('status')).toBeNull();
  });

  it('bounds unresolved media loading and starts a fresh resolver on retry', () => {
    state.resolved = null; const ready = vi.fn(); const view = render(<StoryMedia {...imageProps} onReadyChange={ready} />);
    act(() => vi.advanceTimersByTime(15000)); expect(screen.getByRole('alert')).toBeVisible();
    expect(ready).not.toHaveBeenCalledWith(true);
    state.resolved = imageProps.mediaUrl; fireEvent.click(screen.getByRole('button', { name: 'Retry story media' }));
    decode(view.container.querySelector('img')!); expect(ready).toHaveBeenLastCalledWith(true);
  });

  it.each([{ mediaUrl: '', mediaType: 'image' }, { mediaUrl: imageProps.mediaUrl, mediaType: 'audio' }])('shows a recoverable failure for missing or unsupported media %j', props => {
    const view = render(<StoryMedia {...props} />);
    expect(screen.getByRole('alert')).toBeVisible(); expect(view.container.querySelector('img,video')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry story media' })).toBeEnabled();
  });

  it('isolates a new source from an old resolver, decode event and timeout', () => {
    const ready = vi.fn(); const view = render(<StoryMedia {...imageProps} onReadyChange={ready} />);
    const old = view.container.querySelector('img')!; act(() => vi.advanceTimersByTime(10000));
    view.rerender(<StoryMedia {...imageProps} mediaUrl="https://media.test/second.jpg" onReadyChange={ready} />);
    const current = view.container.querySelector('img')!; expect(current.src).toBe('https://media.test/second.jpg');
    decode(old); expect(ready).not.toHaveBeenCalledWith(true);
    act(() => vi.advanceTimersByTime(6000)); expect(screen.queryByRole('alert')).toBeNull();
    decode(current); expect(ready).toHaveBeenLastCalledWith(true);
  });

  it('does not autoplay a video whose signed URL arrives while paused', async () => {
    state.resolved = null; const ready = vi.fn(); const props = { mediaUrl: 'https://media.test/video.mp4', mediaType: 'video', onReadyChange: ready };
    const view = render(<StoryMedia {...props} isPaused />);
    state.resolved = props.mediaUrl; view.rerender(<StoryMedia {...props} isPaused />);
    const video = view.container.querySelector('video')!; fireEvent.loadedData(video);
    expect(video.autoplay).toBe(false); expect(video.play).not.toHaveBeenCalled(); expect(video.pause).toHaveBeenCalled();
    view.rerender(<StoryMedia {...props} isPaused={false} />); expect(video.play).toHaveBeenCalledOnce();
    fireEvent.playing(video); expect(ready).toHaveBeenLastCalledWith(true);
    await act(async () => {});
  });

  it('offers explicit playback when autoplay is blocked and uses real progress/end instead of looping', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
    const ready = vi.fn(), progress = vi.fn(), ended = vi.fn();
    const view = render(<StoryMedia mediaUrl="https://media.test/video.mp4" mediaType="video" onReadyChange={ready} onProgress={progress} onEnded={ended} />);
    const video = view.container.querySelector('video')!;
    await act(async () => fireEvent.loadedData(video));
    expect(screen.getByRole('button', { name: 'Play video' })).toBeVisible(); expect(ready).not.toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Play video' })); fireEvent.playing(video);
    expect(ready).toHaveBeenLastCalledWith(true); expect(video.loop).toBe(false);
    Object.defineProperty(video, 'duration', { value: 60 }); video.currentTime = 30; fireEvent.timeUpdate(video);
    expect(progress).toHaveBeenLastCalledWith(50); expect(ended).not.toHaveBeenCalled();
    fireEvent.waiting(video); expect(ready).toHaveBeenLastCalledWith(false);
    fireEvent.playing(video); fireEvent.ended(video); expect(ended).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it('ignores a retired play failure and pauses a late play resolution after unmount', async () => {
    let resolve!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(new Promise<void>(done => { resolve = done; }));
    const ready = vi.fn(); const view = render(<StoryMedia mediaUrl="https://media.test/video.mp4" mediaType="video" onReadyChange={ready} />);
    const video = view.container.querySelector('video')!; fireEvent.loadedData(video); view.unmount();
    vi.mocked(video.pause).mockClear(); await act(async () => resolve());
    expect(video.pause).toHaveBeenCalledOnce(); expect(ready).not.toHaveBeenCalledWith(true);
  });
});
