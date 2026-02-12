import { memo, ReactNode, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { liquidSpring, liquidBackdrop } from '@/motion/liquidConfig';
import { X } from 'lucide-react';

interface ExpandingCardProps {
  id: string;
  children: ReactNode;
  expandedContent?: ReactNode;
  className?: string;
  expandedClassName?: string;
}

/**
 * Apple Music-style expanding card.
 * Uses layoutId for position + size continuity.
 * Click to expand into a fullscreen modal, click X or backdrop to collapse.
 */
export const ExpandingCard = memo(({ 
  id, 
  children, 
  expandedContent, 
  className,
  expandedClassName,
}: ExpandingCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const expand = useCallback(() => setIsExpanded(true), []);
  const collapse = useCallback(() => setIsExpanded(false), []);

  return (
    <>
      {/* Collapsed card */}
      {!isExpanded && (
        <motion.div
          layoutId={`expanding-card-${id}`}
          onClick={expand}
          className={cn(
            'liquid-glass-depth cursor-pointer overflow-hidden',
            className
          )}
          whileHover={{ y: -3, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          transition={liquidSpring}
        >
          {children}
        </motion.div>
      )}

      {/* Expanded overlay */}
      <AnimatePresence>
        {isExpanded && (
          <>
            <motion.div
              {...liquidBackdrop}
              className="liquid-modal-backdrop"
              onClick={collapse}
              style={{ zIndex: 9998 }}
            />
            <motion.div
              layoutId={`expanding-card-${id}`}
              className={cn(
                'fixed inset-4 z-[9999] liquid-glass-depth overflow-hidden rounded-3xl',
                expandedClassName
              )}
              transition={liquidSpring}
            >
              {/* Close button */}
              <motion.button
                className="absolute top-4 right-4 z-20 p-2 rounded-full bg-foreground/10 backdrop-blur-sm hover:bg-foreground/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                onClick={collapse}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </motion.button>

              {/* Expanded content */}
              <div className="overflow-y-auto h-full liquid-scroll p-6">
                {expandedContent || children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
});

ExpandingCard.displayName = 'ExpandingCard';
