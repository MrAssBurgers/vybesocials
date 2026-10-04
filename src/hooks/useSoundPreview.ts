import { useCallback, useEffect, useRef, useState } from 'react';
import { getSoundSettings, playCustomAudio, prepareSoundPreview } from '@/lib/premiumSounds';
import { subscribeDevicePreference } from '@/lib/devicePreferences';
import type { SoundMixCategory } from '@/lib/soundMix';
import { useReportAccountSession } from './useReportAccountSession';

let stopCurrentPreview: (() => void) | undefined;

/** One deliberate sample at a time, with no background or off-screen playback. */
export function useSoundPreview() {
  const session = useReportAccountSession();
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const player = useRef<{ stop: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const activeCategory = useRef<SoundMixCategory>('messages');
  const stop = useCallback(() => {
    generation.current++;
    clearTimeout(timer.current);
    const previous = player.current; player.current = null;
    previous?.stop();
    if (stopCurrentPreview === stop) stopCurrentPreview = undefined;
    if (mounted.current) setState('idle');
  }, []);

  useEffect(() => {
    mounted.current = true;
    setState('idle');
    setError(null);
    const unsubscribe = subscribeDevicePreference('vybe-sound-settings', () => {
      const settings = getSoundSettings();
      if (!settings.master || !settings[activeCategory.current] || settings.volume === 0) stop();
    });
    const onHidden = () => { if (document.visibilityState === 'hidden') stop(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', stop);
    return () => {
      mounted.current = false; stop();
      unsubscribe();
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', stop);
    };
  }, [session, stop]);

  const play = useCallback(async (url: string, category: SoundMixCategory) => {
    stopCurrentPreview?.(); stop();
    if (!mounted.current || document.visibilityState === 'hidden') return;
    prepareSoundPreview();
    stopCurrentPreview = stop;
    activeCategory.current = category;
    const token = generation.current;
    const cancelled = () => !mounted.current || generation.current !== token;
    setError(null); setState('loading');
    timer.current = setTimeout(() => {
      if (cancelled()) return;
      stop(); setError('Preview took too long to load. Please try again.');
    }, 15_000);
    const result = await playCustomAudio(url, false, undefined, category, cancelled, () => {
      if (!cancelled()) stop();
    }).catch(() => null);
    if (cancelled()) { result?.stop(); return; }
    if (!result) {
      stop();
      setError('Preview could not play. Check your sound and device settings, then try again.');
      return;
    }
    player.current = result;
    clearTimeout(timer.current);
    setState('playing');
    timer.current = setTimeout(stop, 8_000);
  }, [stop]);
  return { state, error, play, stop };
}
