import { memo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface SmartRepliesBarProps {
  suggestions: string[];
  isLoading: boolean;
  onSelect: (text: string) => void;
}

/**
 * Smart Replies Bar - Lightweight AI suggestions
 * 
 * Features:
 * - 2-3 subtle suggestions after receiving a message
 * - Short, casual, human-sounding
 * - Tap inserts text, does NOT auto-send
 * - Easy to ignore
 */
export const SmartRepliesBar = memo(function SmartRepliesBar({
  suggestions,
  isLoading,
  onSelect,
}: SmartRepliesBarProps) {
  const handleSelect = useCallback((text: string) => {
    onSelect(text);
  }, [onSelect]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Thinking...</span>
      </div>
    );
  }

  if (!suggestions?.length) {
    return null;
  }

  return (
    <div className="flex gap-2 px-4 py-2 overflow-x-auto scrollbar-hide">
      {suggestions.map((suggestion, index) => (
        <Button
          key={index}
          variant="outline"
          size="sm"
          className="flex-shrink-0 h-7 px-3 text-xs rounded-full bg-muted/50 hover:bg-muted border-border/50"
          onClick={() => handleSelect(suggestion)}
        >
          {suggestion}
        </Button>
      ))}
    </div>
  );
});
