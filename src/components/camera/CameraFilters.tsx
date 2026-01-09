import { cn } from '@/lib/utils';

export interface CameraFilter {
  id: string;
  name: string;
  css: string;
}

export const CAMERA_FILTERS: CameraFilter[] = [
  { id: 'normal', name: 'Normal', css: '' },
  { id: 'warm', name: 'Warm', css: 'sepia(0.3) saturate(1.4) brightness(1.1)' },
  { id: 'cool', name: 'Cool', css: 'saturate(0.9) hue-rotate(20deg) brightness(1.05)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.5) contrast(1.1) brightness(0.9)' },
  { id: 'bw', name: 'B&W', css: 'grayscale(1) contrast(1.2)' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.8) contrast(1.1)' },
  { id: 'fade', name: 'Fade', css: 'contrast(0.9) brightness(1.1) saturate(0.8)' },
  { id: 'drama', name: 'Drama', css: 'contrast(1.4) saturate(0.9) brightness(0.95)' },
];

interface CameraFiltersProps {
  currentFilter: string;
  onFilterChange: (filterId: string) => void;
}

export function CameraFilters({ currentFilter, onFilterChange }: CameraFiltersProps) {
  return (
    <div className="flex gap-3 overflow-x-auto py-2 px-4 scrollbar-hide">
      {CAMERA_FILTERS.map((filter) => (
        <button
          key={filter.id}
          onClick={() => onFilterChange(filter.id)}
          className={cn(
            "flex-shrink-0 flex flex-col items-center gap-1 transition-all",
            currentFilter === filter.id && "scale-110"
          )}
        >
          <div
            className={cn(
              "w-14 h-14 rounded-xl overflow-hidden border-2 transition-colors",
              currentFilter === filter.id 
                ? "border-primary" 
                : "border-white/20"
            )}
          >
            <div
              className="w-full h-full bg-gradient-to-br from-primary/60 to-secondary/60"
              style={{ filter: filter.css }}
            />
          </div>
          <span className={cn(
            "text-xs font-medium transition-colors",
            currentFilter === filter.id ? "text-primary" : "text-white/70"
          )}>
            {filter.name}
          </span>
        </button>
      ))}
    </div>
  );
}

export function getFilterCSS(filterId: string): string {
  return CAMERA_FILTERS.find(f => f.id === filterId)?.css || '';
}
