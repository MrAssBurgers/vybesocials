import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSoundSettings, updateSoundSettings, updateCustomSounds, playCustomAudio,
  startRinging, stopAllCallSounds, playPremiumSound, previewSound, playMessageReceiveSound,
} from './premiumSounds';
import { getUserVolumeMultiplier } from './soundMix';

const { allowed, sourceStart, sourceStop, fetchAudio } = vi.hoisted(() => ({
  allowed: vi.fn(async () => true), sourceStart: vi.fn(), sourceStop: vi.fn(), fetchAudio: vi.fn(),
}));
vi.mock('@/lib/deviceSilentMode', () => ({ shouldPlayNotificationSound: allowed }));
vi.mock('@/lib/callSounds', () => ({ stopAllCallSounds: vi.fn() }));

const param = () => ({ value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
const oscillatorStops: ReturnType<typeof vi.fn>[] = [];
let soundClock = Date.now();
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  decodeAudioData = vi.fn(async () => ({ duration: 1 }));
  createBufferSource() { return { ...node(), start: sourceStart, stop: sourceStop, onended: null, buffer: null, loop: false }; }
  createGain() { return { ...node(), gain: param() }; }
  createBiquadFilter() { return { ...node(), frequency: param(), Q: param(), type: '' }; }
  createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; }
  createOscillator() {
    const stop = vi.fn();
    oscillatorStops.push(stop);
    return { ...node(), start: vi.fn(), stop, onended: null, frequency: param(), detune: param(), type: 'sine' };
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(soundClock += 1000);
  oscillatorStops.length = 0;
  allowed.mockResolvedValue(true);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', fetchAudio);
  fetchAudio.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
});
afterEach(() => {
  stopAllCallSounds();
  vi.restoreAllMocks();
  updateSoundSettings({ master: true, calls: true, messages: true, ui: false, volume: 72 });
});

describe('sound preferences', () => {
  it('defaults interface sounds to opt-in while preserving explicit choices', () => {
    expect(getSoundSettings().ui).toBe(false);
    updateSoundSettings({ ui: true });
    expect(getSoundSettings().ui).toBe(true);
    localStorage.setItem('vybe-sound-settings', JSON.stringify({ master: 'false', ui: [], volume: 'loud' }));
    expect(getSoundSettings()).toMatchObject({ master: true, ui: false, volume: 72 });
  });

  it('allows actual zero volume and validates numeric limits', () => {
    updateSoundSettings({ volume: 0 });
    expect(getSoundSettings().volume).toBe(0);
    expect(getUserVolumeMultiplier()).toBe(0);
    updateSoundSettings({ volume: 1000 });
    expect(getSoundSettings().volume).toBe(100);
    updateSoundSettings({ volume: Number.NaN });
    expect(getSoundSettings().volume).toBe(72);
  });

  it('keeps sound controls working when persistent storage fails', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('Denied'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full'); });
    updateSoundSettings({ master: false, volume: 0 });
    expect(getSoundSettings()).toMatchObject({ master: false, volume: 0 });
    expect(getUserVolumeMultiplier()).toBe(0);
  });

  it('uses session preferences when reads work but storage has no space for writes', () => {
    updateSoundSettings({ master: true, volume: 72 });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('Full'); });
    updateSoundSettings({ master: false, volume: 0 });
    expect(getSoundSettings()).toMatchObject({ master: false, volume: 0 });
  });
});

describe('audio lifecycle', () => {
  it('checks device silent mode for uploaded tones as well as bundled sounds', async () => {
    allowed.mockResolvedValue(false);
    expect(await playCustomAudio('/custom-silent.wav', false, undefined, 'messages')).toBeNull();
    expect(allowed).toHaveBeenCalledWith('messages');
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(sourceStart).not.toHaveBeenCalled();
  });

  it('does not play a pending tone after the user mutes sounds', async () => {
    let resolveAudio!: (response: unknown) => void;
    fetchAudio.mockReturnValue(new Promise(resolve => { resolveAudio = resolve; }));
    const playing = playCustomAudio('/slow-message.wav');
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalled());
    updateSoundSettings({ master: false });
    resolveAudio({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
    expect(await playing).toBeNull();
    expect(sourceStart).not.toHaveBeenCalled();
  });

  it('cancels a ringtone still downloading when a call ends', async () => {
    let resolveAudio!: (response: unknown) => void;
    fetchAudio.mockReturnValue(new Promise(resolve => { resolveAudio = resolve; }));
    updateCustomSounds({ call_ringtone: '/slow-ring.wav' });
    const ringing = startRinging();
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalled());
    stopAllCallSounds();
    resolveAudio({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
    await ringing;
    expect(sourceStart).not.toHaveBeenCalled();
  });

  it('stops an active custom ringtone when call sounds are disabled', async () => {
    updateCustomSounds({ call_ringtone: '/active-ring.wav' });
    await startRinging();
    expect(sourceStart).toHaveBeenCalledOnce();
    updateSoundSettings({ calls: false });
    expect(sourceStop).toHaveBeenCalled();
  });

  it('keeps UI previews silent until explicitly enabled', async () => {
    updateSoundSettings({ ui: false, messages: true });
    previewSound('success');
    await Promise.resolve();
    expect(allowed).not.toHaveBeenCalled();
    expect(oscillatorStops).toHaveLength(0);
    updateSoundSettings({ ui: true, messages: false });
    previewSound('success');
    await vi.waitFor(() => expect(oscillatorStops).toHaveLength(3));
    expect(allowed).toHaveBeenCalledWith('ui');
  });

  it('stops all scheduled UI tones when that category is muted, without stopping call audio', async () => {
    updateSoundSettings({ ui: true });
    playPremiumSound('success');
    await vi.waitFor(() => expect(oscillatorStops).toHaveLength(3));
    const uiStops = [...oscillatorStops];
    playPremiumSound('callConnect');
    await vi.waitFor(() => expect(oscillatorStops).toHaveLength(6));
    const callStops = oscillatorStops.slice(3);
    updateSoundSettings({ ui: false });
    uiStops.forEach(stop => expect(stop).toHaveBeenLastCalledWith());
    callStops.forEach(stop => expect(stop).toHaveBeenCalledOnce()); // Scheduled end only.
  });

  it('ending a call never cancels unrelated interface feedback', async () => {
    updateSoundSettings({ ui: true });
    playPremiumSound('toggle');
    await vi.waitFor(() => expect(oscillatorStops).toHaveLength(2));
    stopAllCallSounds();
    oscillatorStops.forEach(stop => expect(stop).toHaveBeenCalledOnce());
  });

  it('cross-tab mute cancels pending synthesized feedback even after unmuting', async () => {
    let allow!: (value: boolean) => void;
    allowed.mockReturnValue(new Promise(resolve => { allow = resolve; }));
    updateSoundSettings({ ui: true });
    playPremiumSound('error');
    await vi.waitFor(() => expect(allowed).toHaveBeenCalledWith('ui'));
    localStorage.setItem('vybe-sound-settings', JSON.stringify({ ...getSoundSettings(), ui: false }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'vybe-sound-settings' }));
    updateSoundSettings({ ui: true });
    allow(true);
    await Promise.resolve();
    expect(oscillatorStops).toHaveLength(0);
  });

  it('does not replay an obsolete download after mute then unmute', async () => {
    let resolveAudio!: (response: unknown) => void;
    fetchAudio.mockReturnValue(new Promise(resolve => { resolveAudio = resolve; }));
    const pending = playCustomAudio('/obsolete-after-mute.wav');
    await vi.waitFor(() => expect(fetchAudio).toHaveBeenCalled());
    updateSoundSettings({ messages: false });
    updateSoundSettings({ messages: true });
    resolveAudio({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
    expect(await pending).toBeNull();
    expect(sourceStart).not.toHaveBeenCalled();
  });

  it('clears queued message notifications when muted before their batching delay', async () => {
    vi.useFakeTimers();
    try {
      playMessageReceiveSound();
      updateSoundSettings({ messages: false });
      updateSoundSettings({ messages: true });
      await vi.advanceTimersByTimeAsync(250);
      expect(allowed).not.toHaveBeenCalled();
      expect(fetchAudio).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
