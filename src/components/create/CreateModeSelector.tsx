import { useRef, useState } from 'react';
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

export function CreateModeSelector({ currentMode, onModeChange }: CreateModeSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative px-4">
      <div
        ref={scrollRef}
        className="flex items-center justify-center gap-6 overflow-x-auto scrollbar-hide py-2"
      >
        {modes.map((mode) => {
          const isActive = currentMode === mode.id;
          const Icon = mode.icon;
          return (
            <motion.button
              key={mode.id}
              onClick={() => {
                triggerHaptic('light');
                onModeChange(mode.id);
              }}
              className="relative flex flex-col items-center gap-1 min-w-[48px]"
              whileTap={{ scale: 0.9 }}
            >
              <Icon
                className={cn(
                  "w-5 h-5 transition-colors duration-200",
                  isActive ? "text-white" : "text-white/50"
                )}
              />
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider transition-colors duration-200",
                  isActive ? "text-white" : "text-white/40"
                )}
              >
                {mode.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="mode-indicator"
                  className="absolute -bottom-1 w-1 h-1 rounded-full bg-white"
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
