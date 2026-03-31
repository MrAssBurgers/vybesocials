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
  compact?: boolean;
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

  // Calculate picker position to stay on screen
  const updatePickerPosition = useCallback(() => {
    if (!containerRef.current) return;
    const buttonRect = containerRef.current.getBoundingClientRect();
    const pickerWidth = 280; // approximate picker width
    const pickerHeight = 56;
    const margin = 12;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left: number;
    let bottom: number;

    // Horizontal: try left-aligned, then adjust
    if (compact) {
      // Center on button
      left = buttonRect.left + buttonRect.width / 2 - pickerWidth / 2;
    } else {
      left = buttonRect.left - 8;
    }

    // Clamp horizontal
    if (left + pickerWidth > viewportWidth - margin) {
      left = viewportWidth - pickerWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    // Vertical: position just above the like button (tight gap)
    const gap = 2;
    bottom = viewportHeight - buttonRect.top + gap;

    // If it would go off top, show below
    if (buttonRect.top - pickerHeight - gap < 0) {
      bottom = viewportHeight - buttonRect.bottom - gap - pickerHeight;
    }

    setPickerStyle({
      position: 'fixed' as const,
      left: `${left}px`,
      bottom: `${bottom}px`,
      zIndex: 9999,
    });
  }, [compact]);

  // Cache bubble positions for drag hit-testing
  const cacheBubbleRects = useCallback(() => {
    if (!pickerRef.current) return;
    const bubbles = pickerRef.current.querySelectorAll('[data-reaction-index]');
    bubbleRects.current = Array.from(bubbles).map(el => el.getBoundingClientRect());
  }, []);

  // Find which reaction the pointer is over
  const getReactionIndexAtPoint = useCallback((clientX: number, clientY: number): number | null => {
    // Expand vertical hit area for easier dragging
    for (let i = 0; i < bubbleRects.current.length; i++) {
      const rect = bubbleRects.current[i];
      const expandY = 20; // extra vertical tolerance
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
    // Cache rects after render
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
    e.preventDefault();
    // Capture pointer so we get move/up even outside element
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointerStart.current = { x: e.clientX, y: e.clientY };
    startLongPress();
  }, [startLongPress]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    cancelLongPress();

    if (isDragging.current && showPicker) {
      // We were in drag mode - select whatever we're hovering
      isDragging.current = false;
      if (hoveredIndex !== null) {
        const reaction = REACTIONS[hoveredIndex];
        triggerHaptic('medium');
        sounds[reaction.sound]();
        if (currentReaction === reaction.type) {
          onReact(null);
        } else {
          onReact(reaction.type);
        }
      }
      setShowPicker(false);
      setHoveredIndex(null);
    } else if (!isLongPress.current && !touchMoved.current) {
      // Quick tap - toggle like
      if (currentReaction) {
        onReact(null);
      } else {
        onReact('like');
        triggerHaptic('light');
        sounds.pop();
      }
    }

    pointerStart.current = null;
    isDragging.current = false;
  }, [cancelLongPress, currentReaction, onReact, showPicker, hoveredIndex]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Check movement threshold for tap detection
    if (pointerStart.current && !isLongPress.current) {
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        touchMoved.current = true;
        cancelLongPress();
      }
    }

    // Drag-to-select: update hovered reaction
    if (isDragging.current && showPicker) {
      // Re-cache rects in case of scroll
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

  // Also handle tapping on individual reactions when picker is open (non-drag)
  const handleSelectReaction = useCallback((type: ReactionType) => {
    if (isDragging.current) return; // handled by pointer up
    triggerHaptic('medium');
    const reaction = getReaction(type);
    sounds[reaction.sound]();
    
    if (currentReaction === type) {
      onReact(null);
    } else {
      onReact(type);
    }
    
    setShowPicker(false);
    setHoveredIndex(null);
  }, [currentReaction, onReact]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Reaction Picker Popup - rendered with fixed positioning */}
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
              "rounded-full shadow-2xl shadow-black/30",
            )}
            style={pickerStyle}
            onMouseLeave={() => {
              if (!isDragging.current) setHoveredIndex(null);
            }}
          >
            {/* Decorative gradient border */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-50 pointer-events-none" />
            
            {REACTIONS.map((reaction, index) => (
              <div
                key={reaction.type}
                onMouseEnter={() => { if (!isDragging.current) setHoveredIndex(index); }}
                onClick={() => handleSelectReaction(reaction.type)}
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

      {/* Like/Reaction Button */}
      <button
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
