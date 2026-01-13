import { useRef, useEffect } from 'react';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface StoryMediaProps {
  mediaUrl: string;
  mediaType: string;
  isPaused?: boolean;
}

export function StoryMedia({ mediaUrl, mediaType, isPaused = false }: StoryMediaProps) {
  const signedUrl = useSignedUrl(mediaUrl);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isPaused) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {
          // Autoplay may be blocked
        });
      }
    }
  }, [isPaused]);

  if (!signedUrl) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (mediaType === 'video') {
    return (
      <div className="w-full h-full bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          src={signedUrl}
          className="max-w-full max-h-full w-auto h-auto object-contain"
          autoPlay
          muted
          playsInline
          loop
        />
      </div>
    );
  }

  return (
    <img
      src={signedUrl}
      alt=""
      className="w-full h-full object-cover"
      draggable={false}
    />
  );
}
