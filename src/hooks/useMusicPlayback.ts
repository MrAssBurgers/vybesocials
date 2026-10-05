import { useCallback, useEffect, useRef, useState } from 'react';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';
import { safeAudioSource } from '@/lib/musicCatalogService';

let stopOtherPlayer: (() => void) | null = null;
const EMPTY = { isPlaying: false, isLoading: false, isLoaded: false, currentTime: 0, duration: 0, error: '' };

/** Explicit media playback, independent of optional UI sound effects. No autoplay. */
export function useMusicPlayback(source: string, maxSeconds = Infinity, authorize?: () => Promise<void>) {
  const session = useReportAccountSession();
  const key = `${session.uid}:${session.epoch}:${source}:${maxSeconds}`;
  const currentKey = useRef(key); currentKey.current = key;
  const [state, setState] = useState({ key, ...EMPTY });
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setMutedState] = useState(false);
  const preferences = useRef({ volume, isMuted }); preferences.current = { volume, isMuted };
  const instance = useRef<HTMLAudioElement | null>(null);
  const release = useRef<(() => void) | null>(null);
  const revision = useRef(0), position = useRef(0), mounted = useRef(false);
  const stop = useCallback(() => {
    revision.current++; release.current?.(); release.current = null; instance.current = null; position.current = 0;
    if (mounted.current) setState(previous => ({ ...previous, isPlaying: false, isLoading: false, currentTime: 0 }));
  }, []);
  const pause = useCallback(() => {
    const time = instance.current?.currentTime || position.current;
    stop(); position.current = time;
    if (mounted.current) setState(previous => ({ ...previous, currentTime: time }));
  }, [stop]);
  useEffect(() => {
    mounted.current = true; position.current = 0;
    setState({ key, ...EMPTY });
    const hidden = () => { if (document.visibilityState === 'hidden') stop(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', stop);
    return () => { mounted.current = false; stop(); if (stopOtherPlayer === stop) stopOtherPlayer = null; document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', stop); };
  }, [key, stop]);

  const play = useCallback(async () => {
    if (!mounted.current || currentKey.current !== key) return;
    const resumeAt = position.current;
    stopOtherPlayer?.(); stop();
    const attempt = ++revision.current;
    const isCurrent = () => mounted.current && currentKey.current === key && revision.current === attempt;
    const update = (patch: Partial<typeof EMPTY>) => { if (isCurrent()) setState(previous => ({ ...previous, key, ...patch })); };
    if (!safeAudioSource(source)) { update({ error: 'No playable audio preview is available.' }); return; }
    if (document.visibilityState === 'hidden') { update({ error: 'Return to this page and press Play.' }); return; }
    let account: () => void;
    try {
      const current = reportAccountSnapshot();
      if (current.uid !== session.uid || current.epoch !== session.epoch) throw new Error('Account changed.');
      account = reportAccountGuard(session.uid || ''); account();
    } catch { update({ error: 'Wait for your account to load, then retry.' }); return; }
    if (authorize) {
      update({ error: '', isLoading: true, isPlaying: false });
      stopOtherPlayer = stop;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let retire: (() => void) | undefined;
      const timeout = new Promise<void>((resolve, reject) => { retire = resolve; timer = setTimeout(() => reject(new Error('Sound check timed out.')), 15000); });
      release.current = () => { clearTimeout(timer); retire?.(); };
      try { await Promise.race([authorize(), timeout]); clearTimeout(timer); account(); if (!isCurrent()) return; release.current = null; }
      catch { if (isCurrent()) { stop(); setState(previous => ({ ...previous, error: 'This sound is no longer available or could not be checked. Refresh and retry.' })); } return; }
    }
    const audio = new Audio(source); instance.current = audio;
    audio.preload = 'metadata'; audio.volume = preferences.current.volume; audio.muted = preferences.current.isMuted;
    const at = resumeAt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      audio.removeEventListener('loadedmetadata', metadata); audio.removeEventListener('timeupdate', time); audio.removeEventListener('ended', ended); audio.removeEventListener('error', failed);
      audio.pause(); audio.removeAttribute('src'); audio.load();
    };
    const fail = (message: string) => { if (!isCurrent()) return; stop(); setState(previous => ({ ...previous, error: message })); };
    const metadata = () => {
      if (!isCurrent()) return;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? Math.min(audio.duration, maxSeconds) : 0;
      if (at > 0 && duration > 0) audio.currentTime = Math.min(at, duration);
      update({ duration, isLoaded: duration > 0 });
    };
    const time = () => {
      if (!isCurrent()) return;
      try { account(); } catch { stop(); return; }
      if (audio.currentTime >= maxSeconds) { stop(); return; }
      position.current = audio.currentTime; update({ currentTime: audio.currentTime });
    };
    const ended = () => { if (isCurrent()) stop(); };
    const failed = () => fail('This audio could not play. Check your connection and press Play to retry.');
    audio.addEventListener('loadedmetadata', metadata); audio.addEventListener('timeupdate', time); audio.addEventListener('ended', ended); audio.addEventListener('error', failed);
    release.current = cleanup; stopOtherPlayer = stop;
    update({ error: '', isLoading: true, isPlaying: false });
    timer = setTimeout(() => fail('Audio took too long to start. Press Play to retry.'), 15000);
    try {
      await audio.play(); account();
      if (!isCurrent()) { audio.pause(); return; }
      clearTimeout(timer); update({ isPlaying: true, isLoading: false });
      if (Number.isFinite(maxSeconds)) timer = setTimeout(() => { if (isCurrent()) stop(); }, Math.max(0, maxSeconds - audio.currentTime) * 1000);
    } catch {
      if (!isCurrent()) { audio.pause(); return; }
      fail('Playback did not start. Press Play to retry.');
    }
  }, [key, maxSeconds, session.uid, source, stop, authorize]);
  const seek = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const duration = instance.current?.duration;
    const time = Math.max(0, Math.min(seconds, Number.isFinite(duration) ? duration! : maxSeconds, maxSeconds));
    position.current = time;
    if (instance.current) instance.current.currentTime = time;
    setState(previous => ({ ...previous, currentTime: time }));
  }, [maxSeconds]);
  const setVolume = useCallback((value: number) => { if (!Number.isFinite(value)) return; const next = Math.max(0, Math.min(1, value)); setVolumeState(next); preferences.current.volume = next; if (instance.current) instance.current.volume = next; }, []);
  const setMuted = useCallback((value: boolean) => { setMutedState(value); preferences.current.isMuted = value; if (instance.current) instance.current.muted = value; }, []);
  const visible = state.key === key ? state : EMPTY;
  return { ...visible, volume, isMuted, setVolume, setMuted, play, pause, stop, seek, toggle: visible.isPlaying || visible.isLoading ? pause : play };
}
