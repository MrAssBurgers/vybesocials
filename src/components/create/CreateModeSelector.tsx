import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

export type CreateMode = 'photo' | 'video' | 'multi' | 'text' | 'story';

interface CreateModeSelectorProps {
  currentMode: CreateMode;
  onModeChange: (mode: CreateMode) => void;
}

const modes: { id: CreateMode; label: string }[] = [
  { id: 'photo', label: 'Photo' },
  { id: 'video', label: 'Short' },
  { id: 'multi', label: 'Carousel' },
  { id: 'text', label: 'Text' },
  { id: 'story', label: 'Story' },
];

/** YouTube-Studio–style segmented mode control under the shutter. */
export function CreateModeSelector({ currentMode, onModeChange }: CreateModeSelectorProps) {
  return (
    <div className="px-4 pb-2">
      <div
        role="tablist"
        aria-label="Create mode"
        className="mx-auto flex max-w-md items-center gap-0.5 rounded-xl border border-white/12 bg-white/[0.07] p-1"
      >
        {modes.map((mode) => {
          const isActive = currentMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                triggerHaptic('light');
                onModeChange(mode.id);
              }}
              className={cn(
                'relative min-w-0 flex-1 rounded-lg px-1.5 py-2 text-center text-[11px] font-semibold tracking-wide transition-colors touch-manipulation',
                isActive
                  ? 'bg-white text-black shadow-sm'
                  : 'text-white/55 hover:text-white/80',
              )}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
