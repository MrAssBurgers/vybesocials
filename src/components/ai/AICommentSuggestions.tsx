import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { invokeEdgeFeature, EDGE_UNAVAILABLE_TOAST } from '@/lib/edgeFeature';
import { liquidSpring } from '@/motion/liquidConfig';
import { triggerHaptic } from '@/lib/haptics';

interface AICommentSuggestionsProps {
  postCaption?: string;
  postTags?: string[];
  onSelectComment: (comment: string) => void;
}

export const AICommentSuggestions = memo(function AICommentSuggestions({
  postCaption,
  postTags,
  onSelectComment,
}: AICommentSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const generateSuggestions = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setIsVisible(true);
    triggerHaptic('light');

    try {
      const { data, unavailable } = await invokeEdgeFeature<{ comments?: string[]; suggestions?: string[] }>(
        'ai-comment-suggestions',
        { postCaption, postTags, postType: 'post' },
      );

      if (unavailable) {
        toast.message(EDGE_UNAVAILABLE_TOAST);
        return;
      }

      setSuggestions(data?.suggestions || data?.comments || []);
    } catch (error) {
      console.error('Comment suggestions error:', error);
      toast.error('Failed to generate suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (comment: string) => {
    triggerHaptic('success');
    onSelectComment(comment);
    setIsVisible(false);
    setSuggestions([]);
  };

  if (!isVisible) {
    return (
      <button
        onClick={generateSuggestions}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-xs font-medium text-primary"
      >
        <Sparkles className="h-3 w-3" />
        AI Suggest
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={liquidSpring}
        className="space-y-2"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Thinking of comments...
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...liquidSpring, delay: i * 0.08 }}
                onClick={() => handleSelect(suggestion)}
                className="px-3 py-1.5 rounded-full bg-muted/60 hover:bg-primary/15 border border-border/50 text-xs text-foreground/90 transition-colors text-left max-w-[260px] truncate"
              >
                <MessageCircle className="h-3 w-3 inline mr-1 text-muted-foreground" />
                {suggestion}
              </motion.button>
            ))}
            <button
              onClick={() => { setIsVisible(false); setSuggestions([]); }}
              className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
});
