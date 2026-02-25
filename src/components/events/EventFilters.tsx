import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, MapPin, Calendar, Search, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { EVENT_CATEGORIES } from '@/hooks/useEvents';

interface EventFiltersProps {
  onFiltersChange: (filters: {
    category?: string;
    location?: string;
    dateRange?: 'today' | 'this-week' | 'this-weekend' | 'this-month';
    search?: string;
  }) => void;
  activeFilters: {
    category?: string;
    location?: string;
    dateRange?: string;
    search?: string;
  };
}

const DATE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-weekend', label: 'This Weekend' },
  { value: 'this-month', label: 'This Month' },
] as const;

export function EventFilters({ onFiltersChange, activeFilters }: EventFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = Object.values(activeFilters).filter(Boolean).length;

  const setFilter = (key: string, value: string | undefined) => {
    onFiltersChange({ ...activeFilters, [key]: value } as any);
  };

  const clearAll = () => {
    onFiltersChange({});
  };

  return (
    <div className="space-y-3">
      {/* Search + Filter Toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={activeFilters.search || ''}
            onChange={(e) => setFilter('search', e.target.value || undefined)}
            className="pl-9 h-10 bg-muted/50"
          />
          {activeFilters.search && (
            <button
              onClick={() => setFilter('search', undefined)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <Button
          variant={expanded ? 'default' : 'outline'}
          size="icon"
          onClick={() => setExpanded(!expanded)}
          className="relative h-10 w-10"
        >
          <Filter className="h-4 w-4" />
          {activeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-bold">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      {/* Expanded Filters */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-4"
          >
            {/* Location */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MapPin className="h-3 w-3" /> Location
              </label>
              <Input
                placeholder="City or area name..."
                value={activeFilters.location || ''}
                onChange={(e) => setFilter('location', e.target.value || undefined)}
                className="h-9 bg-muted/50"
              />
            </div>

            {/* Date Range */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> When
              </label>
              <div className="flex flex-wrap gap-2">
                {DATE_OPTIONS.map((opt) => (
                  <Badge
                    key={opt.value}
                    variant={activeFilters.dateRange === opt.value ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer transition-all',
                      activeFilters.dateRange === opt.value && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => setFilter('dateRange', activeFilters.dateRange === opt.value ? undefined : opt.value)}
                  >
                    {opt.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {EVENT_CATEGORIES.map((cat) => (
                  <Badge
                    key={cat.value}
                    variant={activeFilters.category === cat.value ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer transition-all',
                      activeFilters.category === cat.value && 'bg-primary text-primary-foreground'
                    )}
                    onClick={() => setFilter('category', activeFilters.category === cat.value ? undefined : cat.value)}
                  >
                    {cat.emoji} {cat.label}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Clear All */}
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted-foreground">
                <X className="h-3 w-3 mr-1" /> Clear all filters
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
