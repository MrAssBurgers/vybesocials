import { memo, useEffect, useState } from 'react';

interface ClipVideoProgressProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
}

export const ClipVideoProgress = memo(function ClipVideoProgress({
  videoRef,
  isActive,
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
      <div className="h-[2px] w-full bg-white/15">
        <div
          className="h-full bg-white/90 transition-[width] duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
});
