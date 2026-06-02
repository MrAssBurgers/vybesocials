import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Video, Layers, Type, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

export type CreateMode = 'photo' | 'video' | 'multi' | 'text' | 'story';

interface CreateModeSelectorProps {
  currentMode: CreateMode;
  onModeChange: (mode: CreateMode) => void;
}

const modes: { id: CreateMode; label: string; icon: typeof Camera }[] = [
  { id: 'photo', label: 'Photo', icon: Camera },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'multi', label: 'Multi', icon: Layers },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'story', label: 'Story', icon: BookOpen },
];

/** Snapchat-style mode rail — sits just above the shutter. */
export function CreateModeSelector({ currentMode, onModeChange }: CreateModeSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative px-2 pb-1">
      <div
        ref={scrollRef}
        className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-hide py-1"
      >
        {modes.map((mode) => {
          const isActive = currentMode === mode.id;
          return (
            <motion.button
              key={mode.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onModeChange(mode.id);
              }}
              className={cn(
                'relative flex-shrink-0 px-3.5 py-2 rounded-full transition-colors touch-manipulation',
                isActive ? 'text-white' : 'text-white/45',
              )}
              whileTap={{ scale: 0.94 }}
            >
              {isActive && (
                <motion.div
                  layoutId="create-mode-active-bg"
                  className="absolute inset-0 rounded-full bg-white/15 border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.08)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                />
              )}
              <span
                className={cn(
                  'relative z-10 text-[11px] font-bold uppercase tracking-[0.14em]',
                  isActive && 'text-shadow-sm',
                )}
              >
                {mode.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
