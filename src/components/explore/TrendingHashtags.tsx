import { memo } from 'react';
import { Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendingHashtagsProps {
  tags: { tag: string; count: number }[];
  selectedTag: string | null;
  onSelect: (tag: string) => void;
}

export const TrendingHashtags = memo(function TrendingHashtags({ tags, selectedTag, onSelect }: TrendingHashtagsProps) {
  if (!tags.length) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Hash className="h-4 w-4 text-accent" />
        <span className="text-sm font-bold text-foreground">Trending Tags</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {tags.map((item) => (
          <button
            key={item.tag}
            onClick={() => onSelect(item.tag)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex-shrink-0 border",
              selectedTag === item.tag
                ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                : "bg-card/60 text-foreground border-border/40 hover:bg-accent/20"
            )}
          >
            <span>#{item.tag}</span>
            <span className="text-[10px] opacity-60">{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
