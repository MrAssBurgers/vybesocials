import { useRef, useEffect, useState, useCallback } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';

import { MediaSkeleton } from '@/components/ui/MediaFallback';

interface StoryMediaProps {
  mediaUrl: string;
  mediaType: string;
  isPaused?: boolean;
  onReadyChange?: (ready: boolean) => void;
  onProgress?: (percent: number) => void;
  onEnded?: () => void;
}

/** A new admitted source gets a new resolver and playback lifecycle. */
export function StoryMedia(props: StoryMediaProps) {
  const [attempt, setAttempt] = useState(0);
  return <StoryMediaAttempt key={JSON.stringify([props.mediaUrl, props.mediaType, attempt])}
    {...props} retry={() => setAttempt(value => value + 1)} />;
}

function StoryMediaAttempt({ mediaUrl, mediaType, isPaused = false, onReadyChange, onProgress, onEnded, retry }: StoryMediaProps & { retry: () => void }) {
  const supported = mediaType === 'image' || mediaType === 'video';
  const signedUrl = useSignedUrl(supported ? mediaUrl : null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'blocked' | 'error'>(!mediaUrl?.trim() || !supported ? 'error' : 'loading');
  const videoRef = useRef<HTMLVideoElement>(null);
  const active = useRef(false), loaded = useRef(false), playAttempt = useRef(0);
  const paused = useRef(isPaused); paused.current = isPaused;
  useEffect(() => { active.current = true; return () => { active.current = false; playAttempt.current++; }; }, []);
  useEffect(() => { onReadyChange?.(status === 'ready'); }, [status, onReadyChange]);
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => {
      if (active.current) { playAttempt.current++; videoRef.current?.pause(); setStatus('error'); }
    }, 15_000);
    return () => clearTimeout(timer);
  }, [status]);

  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video || paused.current || !active.current) return;
    const token = ++playAttempt.current;
    setStatus('loading');
    void video.play().then(() => {
      // A delayed play promise must not restart a retired/paused story.
      if (!active.current || paused.current || videoRef.current !== video) video.pause();
    }).catch(error => {
      if (!active.current || paused.current || token !== playAttempt.current) return;
      setStatus(error?.name === 'NotAllowedError' ? 'blocked' : 'error');
    });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPaused) {
      playAttempt.current++;
      video.pause();
      if (loaded.current) setStatus(current => current === 'error' ? current : 'ready');
    } else if (loaded.current) play();
    return () => { playAttempt.current++; video.pause(); };
  }, [isPaused, signedUrl, play]);

  const fail = () => { if (active.current) { playAttempt.current++; videoRef.current?.pause(); setStatus('error'); } };
  return <div className="relative h-full w-full overflow-hidden bg-black">
    {supported && signedUrl && status !== 'error' && (mediaType === 'video' ?
      <video ref={videoRef} src={signedUrl} className="h-full w-full object-contain" muted playsInline preload="auto"
        onLoadedData={() => {
          if (!active.current) return;
          loaded.current = true;
          if (paused.current) setStatus('ready'); else play();
        }}
        onPlaying={() => { if (!active.current || paused.current) videoRef.current?.pause(); else setStatus('ready'); }}
        onWaiting={() => { if (active.current && !paused.current) setStatus('loading'); }}
        onTimeUpdate={event => {
          const video = event.currentTarget;
          if (active.current && !paused.current && Number.isFinite(video.duration) && video.duration > 0) {
            onProgress?.(Math.min(100, Math.max(0, video.currentTime / video.duration * 100)));
          }
        }}
        onEnded={() => { if (active.current && !paused.current) onEnded?.(); }} onError={fail} /> :
      <img src={signedUrl} alt="" className="h-full w-full object-cover" draggable={false}
        style={{ opacity: status === 'ready' ? 1 : 0 }}
        onLoad={event => { if (active.current) setStatus(event.currentTarget.naturalWidth > 0 ? 'ready' : 'error'); }} onError={fail} />)}
    {status === 'loading' && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <MediaSkeleton className="absolute inset-0 opacity-60" />
      <p role="status" className="relative rounded-full bg-black/50 px-4 py-2 text-sm text-white">Loading story…</p>
    </div>}
    {(status === 'error' || status === 'blocked') && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-primary/20 via-black to-accent/20 p-6 text-center text-white">
      <p role={status === 'error' ? 'alert' : 'status'} className="text-sm">
        {status === 'blocked' ? 'Tap to play this video.' : !supported ? 'This story format is not supported.' : 'This story’s media could not be loaded.'}
      </p>
      <button type="button" onClick={event => { event.stopPropagation(); if (status === 'blocked') play(); else retry(); }}
        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black">
        {status === 'blocked' ? 'Play video' : 'Retry story media'}
      </button>
    </div>}
  </div>;
}
