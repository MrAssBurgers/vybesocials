import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

export interface FilterDef {
  id: string;
  name: string;
  css: string;
  category: FilterCategory;
  thumbnail?: string;
}

export type FilterCategory = 'trending' | 'new' | 'saved' | 'ai' | 'all';

const FILTER_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trending', label: '🔥 Trending' },
  { id: 'new', label: '✨ New' },
  { id: 'saved', label: '💾 Saved' },
  { id: 'ai', label: '🤖 AI' },
];

export const PRESET_FILTERS: FilterDef[] = [
  { id: 'normal', name: 'Normal', css: '', category: 'trending' },
  { id: 'warm', name: 'Warm', css: 'sepia(0.3) saturate(1.4) brightness(1.1)', category: 'trending' },
  { id: 'cool', name: 'Cool', css: 'saturate(0.9) hue-rotate(20deg) brightness(1.05)', category: 'trending' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.5) contrast(1.1) brightness(0.9)', category: 'trending' },
  { id: 'bw', name: 'B&W', css: 'grayscale(1) contrast(1.2)', category: 'trending' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.8) contrast(1.1)', category: 'new' },
  { id: 'fade', name: 'Fade', css: 'contrast(0.9) brightness(1.1) saturate(0.8)', category: 'new' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.4) saturate(0.9) brightness(0.95)', category: 'new' },
  { id: 'neon', name: 'Neon', css: 'saturate(2.0) brightness(1.15) contrast(1.2)', category: 'ai' },
  { id: 'cinema', name: 'Cinema', css: 'sepia(0.2) saturate(1.3) contrast(1.15) brightness(0.95)', category: 'ai' },
  { id: 'dreamy', name: 'Dreamy', css: 'brightness(1.1) saturate(0.7) blur(0.3px)', category: 'new' },
  { id: 'moody', name: 'Moody', css: 'brightness(0.85) contrast(1.3) saturate(0.8)', category: 'saved' },
  { id: 'golden', name: 'Golden', css: 'sepia(0.4) saturate(1.6) brightness(1.05) hue-rotate(-10deg)', category: 'trending' },
  { id: 'arctic', name: 'Arctic', css: 'saturate(0.6) brightness(1.15) hue-rotate(180deg)', category: 'ai' },
];

export function getFilterCSS(filterId: string): string {
  return PRESET_FILTERS.find(f => f.id === filterId)?.css || '';
}

interface CameraFilterCarouselProps {
  currentFilter: string;
  onFilterChange: (filterId: string) => void;
}

export function CameraFilterCarousel({ currentFilter, onFilterChange }: CameraFilterCarouselProps) {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredFilters = activeCategory === 'all'
    ? PRESET_FILTERS
    : PRESET_FILTERS.filter(f => f.category === activeCategory);

  return (
    <div className="w-full">
      {/* Category tabs */}
      <div className="flex gap-1 px-4 mb-2 overflow-x-auto scrollbar-hide">
        {FILTER_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => {
              triggerHaptic('light');
              setActiveCategory(cat.id);
            }}
            className={cn(
              "px-3 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all duration-200",
              activeCategory === cat.id
                ? "bg-white/20 text-white"
                : "text-white/40 hover:text-white/60"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter carousel */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto py-1 px-4 scrollbar-hide"
      >
        <AnimatePresence mode="popLayout">
          {filteredFilters.map((filter) => {
            const isActive = currentFilter === filter.id;
            return (
              <motion.button
                key={filter.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                onClick={() => {
                  triggerHaptic('light');
                  onFilterChange(filter.id);
                }}
                className="flex-shrink-0 flex flex-col items-center gap-1"
              >
                <div
                  className={cn(
                    "w-14 h-14 rounded-xl overflow-hidden border-2 transition-all duration-200",
                    isActive
                      ? "border-primary scale-110 shadow-lg shadow-primary/30"
                      : "border-white/15"
                  )}
                >
                  <div
                    className="w-full h-full bg-gradient-to-br from-primary/50 via-accent/30 to-secondary/50"
                    style={{ filter: filter.css || 'none' }}
                  />
                </div>
                <span className={cn(
                  "text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-white/50"
                )}>
                  {filter.name}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
