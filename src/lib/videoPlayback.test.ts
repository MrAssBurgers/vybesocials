import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  playWithAudio,
  readClipsMutedPreference,
  releasePendingAudioUnlocks,
  writeClipsMutedPreference,
} from './videoPlayback';

function fakeVideo(play: () => Promise<void>) {
  return {
    muted: true,
    isConnected: true,
    play: vi.fn(play),
  } as unknown as HTMLVideoElement;
}

describe('video playback', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts clips with sound unless the viewer muted them', () => {
    expect(readClipsMutedPreference()).toBe(false);
    localStorage.setItem('vybe-clips-muted', 'true');
    expect(readClipsMutedPreference()).toBe(false);
    writeClipsMutedPreference(true);
    expect(readClipsMutedPreference()).toBe(true);
    writeClipsMutedPreference(false);
    expect(readClipsMutedPreference()).toBe(false);
  });

  it('plays with sound when the browser allows it', async () => {
    const video = fakeVideo(async () => undefined);
    await expect(playWithAudio(video, false)).resolves.toBe('sound');
    expect(video.muted).toBe(false);
  });

  it('falls back to silent autoplay and unmutes on the next tap', async () => {
    let calls = 0;
    const video = fakeVideo(async () => {
      calls += 1;
      if (calls === 1) throw new Error('NotAllowedError');
    });
    const onAudible = vi.fn();
    await expect(playWithAudio(video, false, onAudible)).resolves.toBe('silent');
    expect(video.muted).toBe(true);
    releasePendingAudioUnlocks();
    expect(video.muted).toBe(false);
    expect(onAudible).toHaveBeenCalledOnce();
  });

  it('stays muted when that is the viewer choice', async () => {
    const video = fakeVideo(async () => undefined);
    await expect(playWithAudio(video, true)).resolves.toBe('silent');
    expect(video.muted).toBe(true);
    releasePendingAudioUnlocks();
    expect(video.muted).toBe(true);
  });
});

it('does not restart playback when scrolling interrupts the first play request', async () => {
  const video = fakeVideo(async () => { throw new DOMException('The play request was interrupted by pause', 'AbortError'); });
  await expect(playWithAudio(video, false)).resolves.toBe('blocked');
  expect(video.play).toHaveBeenCalledOnce();
});
it('does not retry a decoding/network failure as an audio permission failure', async () => {
  const video = fakeVideo(async () => { throw new DOMException('Unsupported video', 'NotSupportedError'); });
  await expect(playWithAudio(video, false)).resolves.toBe('blocked'); expect(video.play).toHaveBeenCalledOnce();
});

it('rejects a late autoplay permission failure after its card is retired', async () => {
  let fail!: (error: Error) => void; let current = true;
  const video = fakeVideo(() => new Promise((_, reject) => { fail = reject; }));
  const result = playWithAudio(video, false, vi.fn(), () => current);
  current = false; fail(new DOMException('Autoplay blocked', 'NotAllowedError'));
  await expect(result).resolves.toBe('blocked'); expect(video.play).toHaveBeenCalledOnce();
});
it('a retired silent card cannot unmute on the next tap', async () => {
  let count = 0; let current = true; const audible = vi.fn();
  const video = fakeVideo(async () => { if (++count === 1) throw new DOMException('Autoplay blocked', 'NotAllowedError'); });
  await expect(playWithAudio(video, false, audible, () => current)).resolves.toBe('silent');
  current = false; releasePendingAudioUnlocks(); expect(video.muted).toBe(true); expect(audible).not.toHaveBeenCalled();
});
it('a new explicit mute choice cancels an earlier queued sound unlock', async () => {
  let count = 0; const audible = vi.fn();
  const video = fakeVideo(async () => { if (++count === 1) throw new DOMException('Autoplay blocked', 'NotAllowedError'); });
  await playWithAudio(video, false, audible); await playWithAudio(video, true);
  releasePendingAudioUnlocks(); expect(video.muted).toBe(true); expect(audible).not.toHaveBeenCalled();
});
