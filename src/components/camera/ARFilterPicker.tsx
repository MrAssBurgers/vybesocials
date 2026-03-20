import { useState, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AR_FILTERS, ARFilterDef } from '@/lib/arFilters';
import { triggerHaptic } from '@/lib/haptics';
import { Loader2 } from 'lucide-react';

type ARCategory = 'all' | 'face' | 'color' | 'particle' | 'full';

const AR_CATEGORIES: { id: ARCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'face', label: '🎭 Face' },
  { id: 'particle', label: '✨ Effects' },
  { id: 'color', label: '🎨 Color' },
];

interface ARFilterPickerProps {
  currentFilter: string | null;
  onFilterChange: (filter: ARFilterDef | null) => void;
  isTracking: boolean;
  isLoading: boolean;
}

export const ARFilterPicker = memo(function ARFilterPicker({
  currentFilter,
  onFilterChange,
  isTracking,
  isLoading,
}: ARFilterPickerProps) {
  const [activeCategory, setActiveCategory] = useState<ARCategory>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = activeCategory === 'all'
    ? AR_FILTERS
    : AR_FILTERS.filter(f => f.category === activeCategory);

  return (
    <div className="w-full">
      {/* AR badge */}
      <div className="flex items-center justify-center mb-1.5 gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80 bg-primary/10 px-2 py-0.5 rounded-full">
          AR Filters
        </span>
        {isLoading && (
          <Loader2 className="w-3 h-3 animate-spin text-primary/60" />
        )}
        {isTracking && !isLoading && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 justify-center mb-2 px-4">
        {AR_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => {
              setActiveCategory(cat.id);
              triggerHaptic('light');
            }}
            className={cn(
              "text-[10px] px-2.5 py-1 rounded-full transition-all duration-200 font-medium",
              activeCategory === cat.id
                ? "bg-primary text-primary-foreground"
                : "bg-white/15 text-white/70 hover:bg-white/25"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Filter scroll */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-2 snap-x snap-mandatory"
      >
        {/* None option */}
        <button
          onClick={() => {
            onFilterChange(null);
            triggerHaptic('light');
          }}
          className={cn(
            "flex-shrink-0 snap-center flex flex-col items-center gap-1 transition-all duration-200",
          )}
        >
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center text-xl border-2 transition-all",
            !currentFilter
              ? "border-primary bg-primary/20 scale-110 shadow-lg shadow-primary/30"
              : "border-white/20 bg-white/10"
          )}>
            🚫
          </div>
          <span className={cn(
            "text-[10px] font-medium",
            !currentFilter ? "text-primary" : "text-white/50"
          )}>
            None
          </span>
        </button>

        {/* AR filters */}
        <AnimatePresence mode="popLayout">
          {filtered.map((filter, i) => {
            const isActive = currentFilter === filter.id;
            return (
              <motion.button
                key={filter.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                onClick={() => {
                  onFilterChange(isActive ? null : filter);
                  triggerHaptic('medium');
                }}
                className="flex-shrink-0 snap-center flex flex-col items-center gap-1 transition-all duration-200"
              >
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center text-xl border-2 transition-all",
                  isActive
                    ? "border-primary bg-primary/20 scale-110 shadow-lg shadow-primary/30"
                    : "border-white/20 bg-white/10 active:scale-95"
                )}>
                  {filter.icon}
                </div>
                <span className={cn(
                  "text-[10px] font-medium max-w-[56px] truncate",
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
});
