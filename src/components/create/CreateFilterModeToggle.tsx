import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface CreateFilterModeToggleProps {
  mode: 'color' | 'ar';
  onChange: (mode: 'color' | 'ar') => void;
  arSupported: boolean;
}

export function CreateFilterModeToggle({ mode, onChange, arSupported }: CreateFilterModeToggleProps) {
  if (!arSupported) return null;

  return (
    <div className="flex justify-center mb-2">
      <div className="relative flex rounded-full bg-black/50 backdrop-blur-xl border border-white/10 p-0.5">
        {(['color', 'ar'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onChange(id);
            }}
            className={cn(
              'relative z-10 px-4 py-1.5 text-[11px] font-bold tracking-wide rounded-full transition-colors',
              mode === id ? 'text-white' : 'text-white/45',
            )}
          >
            {id === 'color' ? 'Lenses' : 'AR FX'}
          </button>
        ))}
        <motion.div
          layoutId="create-filter-mode-pill"
          className="absolute inset-y-0.5 rounded-full bg-white/20 shadow-inner"
          style={{
            width: 'calc(50% - 2px)',
            left: mode === 'color' ? 2 : 'calc(50%)',
          }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        />
      </div>
    </div>
  );
}
