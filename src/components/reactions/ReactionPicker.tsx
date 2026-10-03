import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REACTIONS, ReactionType, ReactionConfig, getReaction } from '@/lib/reactions';
import { triggerHaptic } from '@/lib/haptics';
import { sounds } from '@/lib/sounds';
import { recordEmoji } from '@/lib/frequentEmojis';

interface ReactionPickerProps {
  currentReaction: ReactionType | null;
  onReact: (type: ReactionType | null) => void;
  likeCount: number;
  className?: string;
  compact?: boolean;
  vertical?: boolean;
}

// Individual reaction bubble in the picker
const ReactionBubble = memo(function ReactionBubble({ 
  reaction, 
  index, 
  isHovered,
}: { 
  reaction: ReactionConfig;
  index: number;
  isHovered: boolean;
}) {
  return (
    <div
      data-reaction-index={index}
      className="relative flex flex-col items-center"
      style={{
        transform: isHovered ? 'scale(1.45) translateY(-12px)' : 'scale(1) translateY(0)',
        transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Glow effect */}
      {isHovered && (
        <div
          className="absolute -inset-2 rounded-full opacity-30 blur-md"
          style={{ background: `hsl(${reaction.color})` }}
        />
      )}
      
      {/* Emoji */}
      <span className="text-[28px] relative z-10 select-none drop-shadow-lg pointer-events-none">
        {reaction.emoji}
      </span>
      
      {/* Label tooltip */}
      <AnimatePresence>
        {isHovered && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.8 }}
            className="absolute -top-7 text-[10px] font-bold text-white bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded-full whitespace-nowrap pointer-events-none"
          >
            {reaction.label}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
});

export const ReactionPicker = memo(function ReactionPicker({
  currentReaction,
  onReact,
  likeCount,
  className,
  compact = false,
  vertical = false,
}: ReactionPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const isLongPress = useRef(false);
  const touchMoved = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const bubbleRects = useRef<DOMRect[]>([]);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});

  const activeReaction = currentReaction ? getReaction(currentReaction) : null;

  // Close picker on outside click (only when not dragging)
  useEffect(() => {
    if (!showPicker) return;
    const handleClick = (e: MouseEvent | TouchEvent) => {
      if (isDragging.current) return;
      const target = e.target as Node;
      // Ignore clicks inside the trigger OR inside the portal'd picker itself —
      // otherwise the picker closes before the bubble's onClick fires and only
      // the default 'like' tap ever saves.
      if (containerRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      setShowPicker(false);
      setHoveredIndex(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [showPicker]);

  // Calculate picker position to stay on screen
  const updatePickerPosition = useCallback(() => {
    if (!containerRef.current) return;
    const buttonRect = containerRef.current.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = window.innerWidth;

    if (vertical) {
      // Vertical mode (for clips): position to the left of the button
      const pickerHeight = REACTIONS.length * 44 + 16;
      const top = buttonRect.top + buttonRect.height / 2 - pickerHeight / 2;
      const clampedTop = Math.max(margin, Math.min(top, window.innerHeight - pickerHeight - margin));
      
      setPickerStyle({
        position: 'fixed' as const,
        left: `${buttonRect.left - 56}px`,
        top: `${clampedTop}px`,
        zIndex: 9999,
        transformOrigin: 'right center',
      });
    } else {
      // Horizontal mode (default)
      const pickerWidth = 280;
      const pickerHeight = 56;
      const gap = 4;

      let left = buttonRect.left + buttonRect.width / 2 - pickerWidth / 2;
      if (left + pickerWidth > viewportWidth - margin) left = viewportWidth - pickerWidth - margin;
      if (left < margin) left = margin;

      let top = buttonRect.top - pickerHeight - gap;
      if (top < margin) top = buttonRect.bottom + gap;

      setPickerStyle({
        position: 'fixed' as const,
        left: `${left}px`,
        top: `${top}px`,
        zIndex: 9999,
        transformOrigin: 'bottom center',
      });
    }
  }, [vertical]);

  // Cache bubble positions for drag hit-testing
  const cacheBubbleRects = useCallback(() => {
    if (!pickerRef.current) return;
    const bubbles = pickerRef.current.querySelectorAll('[data-reaction-index]');
    bubbleRects.current = Array.from(bubbles).map(el => el.getBoundingClientRect());
  }, []);

  // Find which reaction the pointer is over
  const getReactionIndexAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    for (let i = 0; i < bubbleRects.current.length; i++) {
      const rect = bubbleRects.current[i];
      const expandY = 20;
      const expandX = 4;
      if (
        clientX >= rect.left - expandX &&
        clientX <= rect.right + expandX &&
        clientY >= rect.top - expandY &&
        clientY <= rect.bottom + expandY
      ) {
        return i;
      }
    }
    return null;
  }, []);

  const openPicker = useCallback(() => {
    isLongPress.current = true;
    isDragging.current = true;
    triggerHaptic('medium');
    updatePickerPosition();
    setShowPicker(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cacheBubbleRects();
      });
    });
  }, [updatePickerPosition, cacheBubbleRects]);

  const startLongPress = useCallback(() => {
    isLongPress.current = false;
    touchMoved.current = false;
    isDragging.current = false;
    longPressTimer.current = setTimeout(() => {
      openPicker();
    }, 400);
  }, [openPicker]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointerStart.current = { x: e.clientX, y: e.clientY };
    startLongPress();
  }, [startLongPress]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    cancelLongPress();

    if (isDragging.current && showPicker) {
      isDragging.current = false;
      const idx = hoveredIndex ?? getReactionIndexAtPoint(e.clientX, e.clientY);
      if (idx !== null) {
        const reaction = REACTIONS[idx];
        triggerHaptic('medium');
        sounds[reaction.sound]();
        recordEmoji(reaction.emoji);
        const next = currentReaction === reaction.type ? null : reaction.type;
        void Promise.resolve(onReact(next)).catch((err) => {
          console.error('[ReactionPicker] onReact failed:', err);
        });
      }
      setShowPicker(false);
      setHoveredIndex(null);
    } else if (!isLongPress.current && !touchMoved.current) {
      const next = currentReaction ? null : ('like' as ReactionType);
      void Promise.resolve(onReact(next)).catch((err) => {
        console.error('[ReactionPicker] onReact failed:', err);
      });
      if (!currentReaction) {
        triggerHaptic('light');
        sounds.pop();
      }
    }

    pointerStart.current = null;
    isDragging.current = false;
  }, [cancelLongPress, currentReaction, onReact, showPicker, hoveredIndex, getReactionIndexAtPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (pointerStart.current && !isLongPress.current) {
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        touchMoved.current = true;
        cancelLongPress();
      }
    }

    if (isDragging.current && showPicker) {
      cacheBubbleRects();
      const idx = getReactionIndexAtPoint(e.clientX, e.clientY);
      if (idx !== hoveredIndex) {
        setHoveredIndex(idx);
        if (idx !== null) {
          triggerHaptic('light');
        }
      }
    }
  }, [cancelLongPress, showPicker, hoveredIndex, cacheBubbleRects, getReactionIndexAtPoint]);

  const handleSelectReaction = useCallback((type: ReactionType) => {
    isDragging.current = false;
    triggerHaptic('medium');
    const reaction = getReaction(type);
    sounds[reaction.sound]();
    recordEmoji(reaction.emoji);

    const next = currentReaction === type ? null : type;
    void Promise.resolve(onReact(next)).catch((err) => {
      console.error('[ReactionPicker] onReact failed:', err);
    });

    setShowPicker(false);
    setHoveredIndex(null);
  }, [currentReaction, onReact]);

  // Render the picker popup via portal to escape overflow:hidden containers
  const pickerElement = (
    <AnimatePresence>
      {showPicker && (
        <motion.div
          ref={pickerRef}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2",
            "bg-card/95 backdrop-blur-xl border border-border/50",
            "shadow-2xl shadow-black/30",
            vertical ? "flex-col rounded-2xl" : "flex-row rounded-full",
          )}
          style={pickerStyle}
          data-no-auto-contrast
          onMouseLeave={() => {
            if (!isDragging.current) setHoveredIndex(null);
          }}
        >
          {/* Decorative gradient border */}
          <div className={cn(
            "absolute inset-0 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-50 pointer-events-none",
            vertical ? "rounded-2xl" : "rounded-full"
          )} />
          
          {REACTIONS.map((reaction, index) => (
            <div
              key={reaction.type}
              onMouseEnter={() => { if (!isDragging.current) setHoveredIndex(index); }}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); handleSelectReaction(reaction.type); }}
            >
              <ReactionBubble
                reaction={reaction}
                index={index}
                isHovered={hoveredIndex === index}
              />
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Render picker via portal to escape overflow:hidden */}
      {createPortal(pickerElement, document.body)}

      {/* Like/Reaction Button */}
      <button
        aria-label={activeReaction ? `Change reaction from ${activeReaction.label}` : 'React to post'}
        aria-pressed={Boolean(activeReaction)}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { cancelLongPress(); isDragging.current = false; }}
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

// Reaction summary display
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

  const typeCounts = new Map<ReactionType, number>();
  for (const r of reactions) {
    typeCounts.set(r, (typeCounts.get(r) || 0) + 1);
  }
  const topTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => getReaction(type));

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {/* Deck-of-cards style stacked emoji circles */}
      <div className="relative flex items-center" style={{ width: `${22 + (topTypes.length - 1) * 10}px`, height: '26px' }}>
        {topTypes.map((r, i) => (
          <motion.span
            key={r.type}
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1, rotate: i === 0 ? -6 : i === 2 ? 6 : 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 500, damping: 22 }}
            className="absolute flex items-center justify-center w-[24px] h-[24px] rounded-full bg-card border-2 border-background text-xs shadow-md"
            style={{ 
              left: `${i * 10}px`,
              zIndex: topTypes.length - i,
              transformOrigin: 'center bottom',
            }}
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
