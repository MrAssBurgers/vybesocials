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
