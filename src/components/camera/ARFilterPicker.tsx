import { useState, useRef, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { AR_FILTERS, ARFilterDef } from '@/lib/arFilters';
import { triggerHaptic } from '@/lib/haptics';
import { Loader2, Lock, Sparkles, Globe, Upload } from 'lucide-react';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { AIFilterGenerator } from './AIFilterGenerator';
import { useAIFilterGenerator } from '@/hooks/useAIFilterGenerator';
import { FilterGallery } from './FilterGallery';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

type ARCategory = 'all' | 'face' | 'color' | 'particle';

const AR_CATEGORIES: { id: ARCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'face', label: '🎭' },
  { id: 'particle', label: '✨' },
  { id: 'color', label: '🎨' },
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
  const [showGallery, setShowGallery] = useState(false);
  const [showAICreate, setShowAICreate] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isPremium } = usePremiumStatus();
  const { generatedFilters } = useAIFilterGenerator();
  const { profile } = useAuth();

  const allFilters = [...AR_FILTERS, ...generatedFilters];
  const filtered = activeCategory === 'all'
    ? allFilters
    : allFilters.filter(f => f.category === activeCategory);

  const handleFilterSelect = (filter: ARFilterDef) => {
    if (filter.premium && !isPremium) {
      toast('VYBE Pro exclusive', {
        description: 'Upgrade to unlock premium AR filters',
        action: { label: 'Upgrade', onClick: () => window.location.href = '/premium' },
      });
      triggerHaptic('error');
      return;
    }
    onFilterChange(currentFilter === filter.id ? null : filter);
    triggerHaptic('medium');
  };

  const handleShareFilter = useCallback(async (filter: ARFilterDef) => {
    if (!profile) { toast.error('Sign in to share filters'); return; }

    const { masks, particles, colorGrade, lighting, cssFilter } = filter;
    const config = JSON.parse(JSON.stringify({ masks, particles, colorGrade, lighting, cssFilter }));

    const { error } = await supabase.from('community_filters').insert([{
      creator_id: profile.id,
      name: filter.name,
      icon: filter.icon,
      filter_config: config,
      category: filter.category,
    }]);

    if (error) {
      toast.error('Failed to share filter');
    } else {
      toast.success('Filter shared to gallery! 🎉');
      triggerHaptic('medium');
    }
  }, [profile]);

  return (
    <>
      <div className="w-full">
        {/* Compact header row */}
        <div className="flex items-center justify-between px-4 mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-primary/80">AR</span>
            {isLoading && <Loader2 className="w-2.5 h-2.5 animate-spin text-primary/60" />}
            {isTracking && !isLoading && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Category pills - compact */}
            {AR_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); triggerHaptic('light'); }}
                className={cn(
                  "text-[9px] px-2 py-0.5 rounded-full transition-all",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "text-white/50"
                )}
              >
                {cat.label}
              </button>
            ))}
            {/* Gallery button */}
            <button
              onClick={() => { setShowGallery(true); triggerHaptic('light'); }}
              className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/70 flex items-center gap-0.5"
            >
              <Globe className="w-2.5 h-2.5" /> Gallery
            </button>
          </div>
        </div>

        {/* AI Generator - collapsible */}
        <div className="mb-1">
          <AIFilterGenerator
            onFilterGenerated={() => {}}
            generatedFilters={generatedFilters}
            currentFilter={currentFilter}
            onFilterChange={onFilterChange}
          />
        </div>

        {/* Filter scroll — compact circles */}
        <div
          ref={scrollRef}
          className="flex gap-1.5 overflow-x-auto scrollbar-hide px-3 pb-1.5 snap-x snap-mandatory"
        >
          {/* None option */}
          <button
            onClick={() => { onFilterChange(null); triggerHaptic('light'); }}
            className="flex-shrink-0 snap-center flex flex-col items-center gap-0.5"
          >
            <div className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center text-base border-2 transition-all",
              !currentFilter
                ? "border-primary bg-primary/20 scale-105"
                : "border-white/20 bg-white/10"
            )}>
              🚫
            </div>
            <span className={cn("text-[8px]", !currentFilter ? "text-primary" : "text-white/40")}>Off</span>
          </button>

          {filtered.map((filter) => {
            const isActive = currentFilter === filter.id;
            const isLocked = filter.premium && !isPremium;
            const isAI = filter.aiGenerated;
            return (
              <div key={filter.id} className="flex-shrink-0 snap-center flex flex-col items-center gap-0.5">
                <button
                  onClick={() => handleFilterSelect(filter)}
                  className="relative"
                >
                  <div className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center text-base border-2 transition-all",
                    isActive
                      ? "border-primary bg-primary/20 scale-105 shadow-md shadow-primary/30"
                      : isLocked
                        ? "border-white/10 bg-white/5 opacity-50"
                        : "border-white/20 bg-white/10 active:scale-95"
                  )}>
                    {filter.icon}
                    {isLocked && (
                      <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                        <Lock className="w-3 h-3 text-white/80" />
                      </div>
                    )}
                  </div>
                  {isAI && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary flex items-center justify-center">
                      <Sparkles className="w-1.5 h-1.5 text-primary-foreground" />
                    </span>
                  )}
                </button>
                <span className={cn(
                  "text-[8px] max-w-[44px] truncate",
                  isActive ? "text-primary" : isLocked ? "text-white/25" : "text-white/40"
                )}>
                  {filter.name}
                </span>
                {/* Share AI filter button */}
                {isAI && isActive && (
                  <button
                    onClick={() => handleShareFilter(filter)}
                    className="flex items-center gap-0.5 text-[7px] text-primary/80 mt-0.5"
                  >
                    <Upload className="w-2 h-2" /> Share
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Gallery overlay */}
      <AnimatePresence>
        {showGallery && (
          <FilterGallery
            isOpen={showGallery}
            onClose={() => setShowGallery(false)}
            onSelectFilter={(filter) => {
              onFilterChange(filter);
              setShowGallery(false);
            }}
            currentFilterId={currentFilter}
          />
        )}
      </AnimatePresence>
    </>
  );
});
