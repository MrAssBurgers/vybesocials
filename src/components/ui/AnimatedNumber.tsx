import { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { liquidSpring } from '@/motion/liquidConfig';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  /** Format the number (e.g., "1.2K"). If omitted, uses Intl number formatting. */
  format?: (n: number) => string;
  /** Direction-aware flip: "up" when value increases, "down" when it decreases. */
  directional?: boolean;
}

/**
 * Apple-style number that scroll-flips when its value changes.
 * Used for likes, follower counts, XP, level — anything that should
 * feel satisfying when it ticks.
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  className,
  format,
  directional = true,
}: AnimatedNumberProps) {
  const prev = useRef(value);
  const [direction, setDirection] = useState<1 | -1>(1);

  useEffect(() => {
    if (value === prev.current) return;
    setDirection(value > prev.current ? 1 : -1);
    prev.current = value;
  }, [value]);

  const display = format ? format(value) : new Intl.NumberFormat().format(value);
  const offset = directional ? direction * 14 : 14;

  return (
    <span className={cn('relative inline-flex overflow-hidden align-baseline tabular-nums', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={display}
          initial={{ y: offset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -offset, opacity: 0 }}
          transition={liquidSpring}
          className="inline-block"
        >
          {display}
        </motion.span>
      </AnimatePresence>
    </span>
  );
});
