import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useWordReactions } from '@/hooks/useDMSettings';
import { cn } from '@/lib/utils';
import { getTopEmojis, recordEmoji } from '@/lib/frequentEmojis';

const QUICK_EMOJIS = ['❤️', '😂', '😮', '👀', '🔥', '💀'];

interface WordReactionsProps {
  messageId: string;
  content: string;
  className?: string;
}

interface WordSelection {
  word: string;
  start: number;
  end: number;
}

export function WordReactableText({ messageId, content, className }: WordReactionsProps) {
  const { reactions, addWordReaction } = useWordReactions(messageId);
  const [selectedWord, setSelectedWord] = useState<WordSelection | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ x: number; y: number } | null>(null);

  const handleWordClick = useCallback((e: React.MouseEvent, word: string, start: number, end: number) => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPopoverAnchor({ x: rect.left + rect.width / 2, y: rect.top });
    setSelectedWord({ word, start, end });
  }, []);

  const smartEmojis = useMemo(() => getTopEmojis(6), []);

  const handleReact = (emoji: string) => {
    if (selectedWord) {
      recordEmoji(emoji);
      addWordReaction({
        wordStart: selectedWord.start,
        wordEnd: selectedWord.end,
        emoji,
      });
      setSelectedWord(null);
      setPopoverAnchor(null);
    }
  };

  // Split content into words with positions
  const words: { word: string; start: number; end: number }[] = [];
  let currentPos = 0;
  content.split(/(\s+)/).forEach((part) => {
    if (part.trim()) {
      words.push({
        word: part,
        start: currentPos,
        end: currentPos + part.length,
      });
    }
    currentPos += part.length;
  });

  // Group reactions by word position
  const reactionsByWord = reactions.reduce((acc, r) => {
    const key = `${r.word_start}-${r.word_end}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r.emoji);
    return acc;
  }, {} as Record<string, string[]>);

  return (
    <span className={cn('inline', className)}>
      {words.map((w, i) => {
        const key = `${w.start}-${w.end}`;
        const wordReactions = reactionsByWord[key] || [];
        
        return (
          <span key={i} className="inline relative">
            <span
              onClick={(e) => handleWordClick(e, w.word, w.start, w.end)}
              className={cn(
                'cursor-pointer hover:bg-primary/20 rounded px-0.5 transition-colors',
                wordReactions.length > 0 && 'underline decoration-primary decoration-2'
              )}
            >
              {w.word}
            </span>
            {wordReactions.length > 0 && (
              <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[10px] flex gap-0.5">
                {wordReactions.slice(0, 3).map((emoji, j) => (
                  <motion.span
                    key={j}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="drop-shadow-sm"
                  >
                    {emoji}
                  </motion.span>
                ))}
              </span>
            )}
            {i < words.length - 1 && ' '}
          </span>
        );
      })}

      {/* Emoji picker popover */}
      <AnimatePresence>
        {selectedWord && (
          <Popover open={!!selectedWord} onOpenChange={() => setSelectedWord(null)}>
            <PopoverTrigger asChild>
              <span className="hidden" />
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-2" 
              side="top"
              align="center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex gap-1"
              >
                {QUICK_EMOJIS.map((emoji) => (
                  <motion.button
                    key={emoji}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleReact(emoji)}
                    className="text-lg hover:bg-muted p-1 rounded"
                  >
                    {emoji}
                  </motion.button>
                ))}
              </motion.div>
              <p className="text-xs text-muted-foreground text-center mt-1">
                React to "{selectedWord.word}"
              </p>
            </PopoverContent>
          </Popover>
        )}
      </AnimatePresence>
    </span>
  );
}
