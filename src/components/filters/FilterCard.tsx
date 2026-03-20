import { motion } from 'framer-motion';
import { Eye, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { Filter } from '@/hooks/useFilters';

interface FilterCardProps {
  filter: Filter;
  onTap: () => void;
}

export function FilterCard({ filter, onTap }: FilterCardProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={() => {
        triggerHaptic('light');
        onTap();
      }}
      className="w-full text-left"
    >
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted border border-border/30">
        {/* Filter preview */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-primary/40 via-accent/30 to-secondary/40"
          style={{ filter: filter.css_filter || 'none' }}
        />

        {/* Overlay info */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Usage count badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full">
          <Eye className="w-3 h-3 text-white/80" />
          <span className="text-[10px] text-white/80 font-medium">
            {filter.usage_count > 999 ? `${(filter.usage_count / 1000).toFixed(1)}k` : filter.usage_count}
          </span>
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="text-white font-semibold text-sm truncate">{filter.name}</p>
          {filter.creator && (
            <p className="text-white/60 text-xs truncate mt-0.5">
              by @{filter.creator.username}
            </p>
          )}
        </div>
      </div>
    </motion.button>
  );
}
