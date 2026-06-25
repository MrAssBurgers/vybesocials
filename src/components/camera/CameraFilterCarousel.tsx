import { useRef, useEffect } from 'react';
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
  { id: 'snap', name: 'VYBE', css: 'contrast(1.06) saturate(1.28) brightness(1.06) sepia(0.06)', emoji: '✨' },
  { id: 'normal', name: 'Normal', css: '', emoji: '○' },
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
  return PRESET_FILTERS.find((f) => f.id === filterId)?.css || '';
}

interface CameraFilterCarouselProps {
  currentFilter: string;
  onFilterChange: (filterId: string) => void;
}

export function CameraFilterCarousel({ currentFilter, onFilterChange }: CameraFilterCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeIndex = PRESET_FILTERS.findIndex((f) => f.id === currentFilter);

  useEffect(() => {
    if (scrollRef.current && activeIndex >= 0) {
      const el = scrollRef.current.children[activeIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeIndex]);

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto py-3 px-4 scrollbar-hide snap-x snap-mandatory"
      >
        {PRESET_FILTERS.map((filter) => {
          const isActive = currentFilter === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onFilterChange(filter.id);
              }}
              className="flex-shrink-0 flex flex-col items-center gap-1.5 snap-center touch-manipulation"
            >
              <motion.div
                animate={isActive ? { scale: 1.12, y: -2 } : { scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className={cn(
                  'relative w-[62px] h-[62px] rounded-full overflow-hidden',
                  isActive
                    ? 'ring-[3px] ring-white ring-offset-[3px] ring-offset-black/80 shadow-[0_0_24px_rgba(255,255,255,0.35)]'
                    : 'ring-1 ring-white/20 opacity-85',
                )}
              >
                <div
                  className="absolute inset-0 bg-gradient-to-br from-primary/80 via-accent/60 to-violet-600/80"
                  style={filter.css ? { filter: filter.css } : undefined}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                  <span className="text-2xl drop-shadow-md">{filter.emoji}</span>
                </div>
              </motion.div>
              <span
                className={cn(
                  'text-[10px] font-semibold max-w-[64px] truncate transition-all',
                  isActive ? 'text-white opacity-100' : 'text-white/0 h-0 overflow-hidden',
                )}
              >
                {filter.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
