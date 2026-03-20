import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

export interface FilterDef {
  id: string;
  name: string;
  css: string;
  emoji: string;
}

export const PRESET_FILTERS: FilterDef[] = [
  { id: 'normal', name: 'Normal', css: '', emoji: '🔵' },
  { id: 'warm', name: 'Warm', css: 'sepia(0.3) saturate(1.4) brightness(1.1)', emoji: '🌅' },
  { id: 'cool', name: 'Cool', css: 'saturate(0.9) hue-rotate(20deg) brightness(1.05)', emoji: '❄️' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.5) contrast(1.1) brightness(0.9)', emoji: '📷' },
  { id: 'bw', name: 'B&W', css: 'grayscale(1) contrast(1.2)', emoji: '🖤' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.8) contrast(1.1)', emoji: '🎨' },
  { id: 'fade', name: 'Fade', css: 'contrast(0.9) brightness(1.1) saturate(0.8)', emoji: '🌫️' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.4) saturate(0.9) brightness(0.95)', emoji: '🎭' },
  { id: 'neon', name: 'Neon', css: 'saturate(2.0) brightness(1.15) contrast(1.2)', emoji: '💜' },
  { id: 'cinema', name: 'Cinema', css: 'sepia(0.2) saturate(1.3) contrast(1.15) brightness(0.95)', emoji: '🎬' },
  { id: 'dreamy', name: 'Dreamy', css: 'brightness(1.1) saturate(0.7) blur(0.3px)', emoji: '💭' },
  { id: 'moody', name: 'Moody', css: 'brightness(0.85) contrast(1.3) saturate(0.8)', emoji: '🌑' },
  { id: 'golden', name: 'Golden', css: 'sepia(0.4) saturate(1.6) brightness(1.05) hue-rotate(-10deg)', emoji: '✨' },
  { id: 'arctic', name: 'Arctic', css: 'saturate(0.6) brightness(1.15) hue-rotate(180deg)', emoji: '🧊' },
];

export function getFilterCSS(filterId: string): string {
  return PRESET_FILTERS.find(f => f.id === filterId)?.css || '';
}

interface CameraFilterCarouselProps {
  currentFilter: string;
  onFilterChange: (filterId: string) => void;
}

export function CameraFilterCarousel({ currentFilter, onFilterChange }: CameraFilterCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIndex = PRESET_FILTERS.findIndex(f => f.id === currentFilter);

  // Auto-scroll to active filter
  useEffect(() => {
    if (scrollRef.current && activeIndex >= 0) {
      const el = scrollRef.current.children[activeIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeIndex]);

  return (
    <div className="w-full px-2">
      {/* Snapchat-style circular filter buttons */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto py-2 px-2 scrollbar-hide snap-x snap-mandatory"
      >
        {PRESET_FILTERS.map((filter, i) => {
          const isActive = currentFilter === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => {
                triggerHaptic('light');
                onFilterChange(filter.id);
              }}
              className="flex-shrink-0 flex flex-col items-center gap-1 snap-center"
            >
              <motion.div
                animate={isActive ? { scale: 1.15 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  "w-[52px] h-[52px] rounded-full flex items-center justify-center transition-all duration-200",
                  isActive
                    ? "ring-[2.5px] ring-primary ring-offset-2 ring-offset-black bg-white/15"
                    : "bg-white/10 border border-white/15"
                )}
              >
                <span className="text-xl">{filter.emoji}</span>
              </motion.div>
              <span className={cn(
                "text-[10px] font-medium transition-colors max-w-[52px] truncate",
                isActive ? "text-white" : "text-white/40"
              )}>
                {filter.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
