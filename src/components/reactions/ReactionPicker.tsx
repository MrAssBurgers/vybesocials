import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REACTIONS, ReactionType, ReactionConfig, getReaction } from '@/lib/reactions';
import { triggerHaptic } from '@/lib/haptics';
import { sounds } from '@/lib/sounds';

interface ReactionPickerProps {
  currentReaction: ReactionType | null;
  onReact: (type: ReactionType | null) => void;
  likeCount: number;
  className?: string;
  compact?: boolean; // For clips/shorts overlay
}

// Individual reaction bubble in the picker
const ReactionBubble = memo(function ReactionBubble({ 
  reaction, 
  index, 
  isHovered,
  onHover,
  onSelect 
}: { 
  reaction: ReactionConfig;
  index: number;
  isHovered: boolean;
  onHover: (index: number | null) => void;
  onSelect: (type: ReactionType) => void;
}) {
  return (
    <motion.button
      initial={{ scale: 0, y: 20, opacity: 0 }}
      animate={{ 
        scale: isHovered ? 1.45 : 1, 
        y: isHovered ? -12 : 0, 
        opacity: 1 
      }}
      exit={{ scale: 0, y: 10, opacity: 0 }}
      transition={{ 
        type: 'spring', 
        stiffness: 500, 
        damping: 25,
        delay: index * 0.035
      }}
      onMouseEnter={() => onHover(index)}
      onTouchStart={() => onHover(index)}
      onClick={() => onSelect(reaction.type)}
      className="relative flex flex-col items-center"
    >
      {/* Glow effect */}
      {isHovered && (
        <motion.div
          layoutId="reaction-glow"
          className="absolute -inset-2 rounded-full opacity-30 blur-md"
          style={{ background: `hsl(${reaction.color})` }}
        />
      )}
      
      {/* Emoji */}
      <span className="text-[28px] relative z-10 select-none drop-shadow-lg">
        {reaction.emoji}
      </span>
      
      {/* Label tooltip */}
      <AnimatePresence>
        {isHovered && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.8 }}
            className="absolute -top-7 text-[10px] font-bold text-white bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded-full whitespace-nowrap"
          >
            {reaction.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
});

export const ReactionPicker = memo(function ReactionPicker({
  currentReaction,
  onReact,
  likeCount,
  className,
  compact = false,
}: ReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLongPress = useRef(false);
  const touchMoved = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const activeReaction = currentReaction ? getReaction(currentReaction) : null;

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setHoveredIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [showPicker]);

  const startLongPress = useCallback(() => {
    isLongPress.current = false;
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      triggerHaptic('medium');
      setShowPicker(true);
    }, 400);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    pointerStart.current = { x: e.clientX, y: e.clientY };
    startLongPress();
  }, [startLongPress]);

  const handlePointerUp = useCallback(() => {
    cancelLongPress();
    if (!isLongPress.current && !touchMoved.current) {
      // Quick tap - toggle like
      if (currentReaction) {
        onReact(null); // Remove reaction
      } else {
        onReact('like');
        triggerHaptic('light');
        sounds.pop();
      }
    }
    pointerStart.current = null;
  }, [cancelLongPress, currentReaction, onReact]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Only count as "moved" if finger traveled more than 10px
    if (pointerStart.current) {
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        touchMoved.current = true;
        cancelLongPress();
      }
    }
  }, [cancelLongPress]);

  const handleSelectReaction = useCallback((type: ReactionType) => {
    triggerHaptic('medium');
    const reaction = getReaction(type);
    sounds[reaction.sound]();
    
    if (currentReaction === type) {
      onReact(null); // Toggle off if same reaction
    } else {
      onReact(type);
    }
    
    setShowPicker(false);
    setHoveredIndex(null);
  }, [currentReaction, onReact]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Reaction Picker Popup */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.6, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className={cn(
              "absolute z-50 flex items-center gap-1.5 px-3 py-2",
              "bg-card/95 backdrop-blur-xl border border-border/50",
              "rounded-full shadow-2xl shadow-black/30",
              compact ? "bottom-full mb-3 left-1/2 -translate-x-1/2" : "bottom-full mb-3 -left-2"
            )}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Decorative gradient border */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-50 pointer-events-none" />
            
            {REACTIONS.map((reaction, index) => (
              <ReactionBubble
                key={reaction.type}
                reaction={reaction}
                index={index}
                isHovered={hoveredIndex === index}
                onHover={setHoveredIndex}
                onSelect={handleSelectReaction}
              />
            ))}
            
            {/* Notch/arrow */}
            <div className="absolute -bottom-1.5 left-6 w-3 h-3 bg-card/95 border-b border-r border-border/50 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Like/Reaction Button */}
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={cancelLongPress}
        onPointerMove={handlePointerMove}
        className={cn(
          "flex items-center justify-center h-8 w-8 active:scale-90 transition-transform touch-none select-none",
          compact && "h-10 w-10"
        )}
      >
        {activeReaction ? (
          <motion.span
            key={activeReaction.type}
            initial={{ scale: 0.5, rotate: -20 }}
            animate={{ scale: [1, 1.3, 0.95, 1.05, 1], rotate: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="text-[22px] drop-shadow-md"
          >
            {activeReaction.emoji}
          </motion.span>
        ) : (
          <Heart className={cn(
            "h-6 w-6 transition-all text-foreground hover:text-primary",
            compact && "h-7 w-7 text-white drop-shadow-lg"
          )} />
        )}
      </button>
    </div>
  );
});

// Reaction summary display - shows top reactions with count
interface ReactionSummaryProps {
  reactions: ReactionType[];
  totalCount: number;
  className?: string;
}

export const ReactionSummary = memo(function ReactionSummary({
  reactions,
  totalCount,
  className
}: ReactionSummaryProps) {
  if (totalCount === 0) return null;

  // Get unique reaction types, ordered by frequency
  const typeCounts = new Map<ReactionType, number>();
  for (const r of reactions) {
    typeCounts.set(r, (typeCounts.get(r) || 0) + 1);
  }
  const topTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => getReaction(type));

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex -space-x-1">
        {topTypes.map((r, i) => (
          <motion.span
            key={r.type}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.05 }}
            className="text-sm relative inline-block"
            style={{ zIndex: topTypes.length - i }}
          >
            {r.emoji}
          </motion.span>
        ))}
      </div>
      <span className="text-sm font-semibold text-foreground/80">
        {totalCount.toLocaleString()}
      </span>
    </div>
  );
});
