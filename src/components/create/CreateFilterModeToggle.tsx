import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface CreateFilterModeToggleProps {
  mode: 'color' | 'ar';
  onChange: (mode: 'color' | 'ar') => void;
  /** Kept for API compatibility — AR tray is Coming Soon either way. */
  arSupported?: boolean;
}

export function CreateFilterModeToggle({ mode, onChange }: CreateFilterModeToggleProps) {
  return (
    <div className="mb-2 flex justify-center">
      <div
        role="tablist"
        aria-label="Filter type"
        className="flex rounded-xl border border-white/12 bg-black/45 p-0.5 backdrop-blur-md"
      >
        {(['color', 'ar'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => {
              triggerHaptic('light');
              onChange(id);
            }}
            className={cn(
              'relative z-10 rounded-[10px] px-4 py-1.5 text-[11px] font-semibold tracking-wide transition-colors',
              mode === id ? 'bg-white text-black' : 'text-white/50',
            )}
          >
            {id === 'color' ? 'Looks' : 'AR'}
          </button>
        ))}
      </div>
    </div>
  );
}
