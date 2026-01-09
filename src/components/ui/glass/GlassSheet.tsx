import { forwardRef, ReactNode } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { X } from 'lucide-react';

interface GlassSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  side?: 'bottom' | 'right';
  title?: string;
}

export const GlassSheet = forwardRef<HTMLDivElement, GlassSheetProps>(
  ({ isOpen, onClose, children, className, side = 'bottom', title }, ref) => {
    const { reduceMotion } = useAccessibility();

    const variants = {
      bottom: {
        initial: { y: '100%' },
        animate: { y: 0 },
        exit: { y: '100%' },
      },
      right: {
        initial: { x: '100%' },
        animate: { x: 0 },
        exit: { x: '100%' },
      },
    };

    const handleDragEnd = (_: any, info: PanInfo) => {
      const threshold = 100;
      if (side === 'bottom' && info.offset.y > threshold) {
        onClose();
      } else if (side === 'right' && info.offset.x > threshold) {
        onClose();
      }
    };

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={onClose}
            />

            {/* Sheet */}
            <motion.div
              ref={ref}
              {...variants[side]}
              transition={{ 
                type: reduceMotion ? 'tween' : 'spring', 
                damping: 30, 
                stiffness: 400,
                duration: reduceMotion ? 0.1 : undefined
              }}
              drag={side === 'bottom' ? 'y' : 'x'}
              dragConstraints={{ top: 0, left: 0 }}
              dragElastic={0.1}
              onDragEnd={handleDragEnd}
              className={cn(
                'fixed z-50 liquid-glass overflow-hidden',
                side === 'bottom' && 'inset-x-0 bottom-0 rounded-t-2xl max-h-[85vh]',
                side === 'right' && 'right-0 top-0 bottom-0 w-full max-w-md rounded-l-2xl',
                className
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drag handle for bottom sheet */}
              {side === 'bottom' && (
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full bg-foreground/20" />
                </div>
              )}

              {/* Header */}
              {title && (
                <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/5">
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-xl hover:bg-foreground/5 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Content */}
              <div className="overflow-y-auto max-h-full">
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
);

GlassSheet.displayName = 'GlassSheet';
