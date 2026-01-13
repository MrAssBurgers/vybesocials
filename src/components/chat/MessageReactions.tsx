import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Reaction {
  user_id: string;
  emoji: string;
}

interface MessageReactionsProps {
  reactions: Reaction[];
  onReact: (emoji: string) => void;
  userReaction?: string | null;
  isOwn?: boolean;
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

/**
 * Reaction display that appears under the message bubble
 * Click/tap on reactions to open the picker
 */
export const MessageReactions = memo(function MessageReactions({
  reactions,
  onReact,
  userReaction,
  isOwn = false,
}: MessageReactionsProps) {
  // Aggregate reactions by emoji
  const aggregated = reactions.reduce((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const entries = Object.entries(aggregated).slice(0, 4);

  if (entries.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn(
        "flex items-center gap-0.5 mt-1 bg-background/95 border border-border/30 rounded-full px-1.5 py-0.5 shadow-sm backdrop-blur-sm",
        isOwn ? "self-end" : "self-start"
      )}
    >
      {entries.map(([emoji, count]) => (
        <motion.button
          key={emoji}
          whileTap={{ scale: 0.85 }}
          onClick={() => onReact(emoji)}
          className={cn(
            "flex items-center gap-0.5 px-1 py-0.5 rounded-full text-xs transition-colors",
            userReaction === emoji && "bg-primary/15"
          )}
        >
          <span className="text-sm">{emoji}</span>
          {count > 1 && (
            <span className="text-[9px] text-muted-foreground font-medium">
              {count}
            </span>
          )}
        </motion.button>
      ))}
    </motion.div>
  );
});

interface ReactionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  userReaction?: string | null;
  position?: 'top' | 'bottom';
}

/**
 * Floating reaction picker - appears on long-press (mobile) or hover (desktop)
 * Snapchat-style with smooth animations
 */
export const ReactionPicker = memo(function ReactionPicker({
  isOpen,
  onClose,
  onReact,
  userReaction,
  position = 'top',
}: ReactionPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to prevent immediate close on touch
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleReact = useCallback((emoji: string) => {
    onReact(emoji);
    onClose();
  }, [onReact, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0, scale: 0.8, y: position === 'top' ? 8 : -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: position === 'top' ? 8 : -8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-50",
            "bg-background/95 backdrop-blur-xl border border-border/50 rounded-full",
            "px-2 py-1.5 shadow-xl",
            "flex items-center gap-0.5",
            position === 'top' ? '-top-12' : '-bottom-12'
          )}
        >
          {QUICK_REACTIONS.map((emoji, index) => (
            <motion.button
              key={emoji}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ 
                type: 'spring', 
                stiffness: 500, 
                damping: 25,
                delay: index * 0.03 
              }}
              whileHover={{ scale: 1.25, y: -2 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleReact(emoji)}
              className={cn(
                "p-1.5 rounded-full text-lg transition-colors",
                userReaction === emoji && "bg-primary/20"
              )}
            >
              {emoji}
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default MessageReactions;
