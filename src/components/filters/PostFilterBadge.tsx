import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { useNavigate } from 'react-router-dom';

interface PostFilterBadgeProps {
  filterName: string;
  filterId: string;
  className?: string;
}

/**
 * "Use this filter" badge shown on posts that have a filter applied.
 * Tapping opens the filter detail / navigates to filters page.
 */
export function PostFilterBadge({ filterName, filterId, className }: PostFilterBadgeProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        triggerHaptic('light');
        navigate(`/filters?id=${filterId}`);
      }}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
        "bg-white/15 backdrop-blur-md border border-white/10",
        "text-white text-xs font-medium",
        "active:scale-95 transition-transform duration-100",
        className
      )}
    >
      <Sparkles className="w-3 h-3" />
      <span className="truncate max-w-[120px]">{filterName}</span>
    </button>
  );
}
