import { Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Small mute control. Shown in the video's right-hand corner only while paused. */
export function PausedMuteButton({
  muted,
  onToggle,
  className,
}: {
  muted: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={muted ? 'Unmute' : 'Mute'}
      aria-pressed={!muted}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white active:scale-90',
        className,
      )}
    >
      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}
