import { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ClipVideoProgressProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  branded?: boolean;
}

export const ClipVideoProgress = memo(function ClipVideoProgress({
  videoRef,
  isActive,
  branded = false,
}: ClipVideoProgressProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) {
      setProgress(0);
      return;
    }

    const onTimeUpdate = () => {
      if (!video.duration || !Number.isFinite(video.duration)) return;
      setProgress((video.currentTime / video.duration) * 100);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    onTimeUpdate();
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [videoRef, isActive]);

  if (!isActive) return null;

  return (
    <div
      className="absolute inset-x-0 z-20 pointer-events-none"
      style={{ bottom: 'var(--clips-progress-bottom, 0px)' }}
    >
      <div className={cn('h-[2px] w-full', branded ? 'bg-white/10' : 'bg-white/15')}>
        <div
          className={cn(
            'h-full transition-[width] duration-75 ease-linear',
            branded
              ? 'bg-gradient-to-r from-primary via-accent to-[hsl(var(--neon-pink))]'
              : 'bg-white/90',
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
});
