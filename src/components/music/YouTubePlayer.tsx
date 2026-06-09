import { useEffect, useRef } from 'react';
import { upsertLivePresence, clearLivePresence } from '@/lib/livePresence';

interface Props {
  /** YouTube video ID (the v= param). */
  videoId: string;
  /** Optional: known title for nicer presence label before YT API responds. */
  title?: string;
  /** Optional: channel/author */
  channel?: string;
  /** Width in pixels or CSS string. Default 100%. */
  width?: number | string;
  /** Height in pixels. Default keeps 16:9. */
  height?: number | string;
  autoplay?: boolean;
  className?: string;
  /** Called when the player is destroyed. */
  onEnded?: () => void;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const ytApiPromise: { current: Promise<any> | null } = { current: null };

function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise.current) return ytApiPromise.current;

  ytApiPromise.current = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    if (!document.getElementById('youtube-iframe-api')) {
      const s = document.createElement('script');
      s.id = 'youtube-iframe-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
  return ytApiPromise.current;
}

/**
 * In-app YouTube player that mirrors playback to live_music_presence so
 * friends see a "Watching on YouTube" pill on the user's profile/DMs.
 *
 * No OAuth required — we only know what they watch *inside Vybe*.
 */
export function YouTubePlayer({
  videoId,
  title,
  channel,
  width = '100%',
  height = '100%',
  autoplay = false,
  className,
  onEnded,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const pollRef = useRef<number | null>(null);
  const lastIsPlayingRef = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    let player: any;

    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      player = new YT.Player(hostRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            // Push initial idle presence — only when autoplay
            if (autoplay) report(true, player);
          },
          onStateChange: (e: any) => {
            // 1 = playing, 2 = paused, 0 = ended
            if (e.data === 1) {
              report(true, player);
              startPolling(player);
            } else if (e.data === 2) {
              report(false, player);
              stopPolling();
            } else if (e.data === 0) {
              stopPolling();
              clearLivePresence('youtube');
              onEnded?.();
            }
          },
        },
      });
      playerRef.current = player;
    });

    return () => {
      cancelled = true;
      stopPolling();
      if (lastIsPlayingRef.current) {
        // Best effort: clear our youtube presence when this player unmounts
        clearLivePresence('youtube');
      }
      try {
        playerRef.current?.destroy?.();
      } catch {}
      playerRef.current = null;
    };
     
  }, [videoId]);

  function report(isPlaying: boolean, p: any) {
    lastIsPlayingRef.current = isPlaying;
    const data = (() => {
      try {
        const info = p?.getVideoData?.() ?? {};
        return {
          title: info.title || title || null,
          channel: info.author || channel || null,
          duration: Math.round((p?.getDuration?.() || 0) * 1000) || null,
          progress: Math.round((p?.getCurrentTime?.() || 0) * 1000) || null,
        };
      } catch {
        return { title: title ?? null, channel: channel ?? null, duration: null, progress: null };
      }
    })();

    upsertLivePresence({
      provider: 'youtube',
      trackId: videoId,
      title: data.title,
      artist: data.channel,
      albumArtUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      trackUrl: `https://www.youtube.com/watch?v=${videoId}`,
      durationMs: data.duration,
      progressMs: data.progress,
      isPlaying,
    }).catch(() => {});
  }

  function startPolling(p: any) {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      if (lastIsPlayingRef.current) report(true, p);
    }, 15_000);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  return (
    <div
      className={className}
      style={{
        width,
        aspectRatio: '16 / 9',
        ...(typeof height === 'number' ? { height } : {}),
      }}
    >
      <div ref={hostRef} className="w-full h-full" />
    </div>
  );
}
