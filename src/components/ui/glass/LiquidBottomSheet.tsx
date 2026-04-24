import { memo, forwardRef, ReactNode } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { liquidSpring, liquidBackdrop } from '@/motion/liquidConfig';
import { X } from 'lucide-react';

interface LiquidBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
  /** Max height as vh (default 85) */
  maxHeight?: number;
}

export const LiquidBottomSheet = memo(forwardRef<HTMLDivElement, LiquidBottomSheetProps>(
  ({ isOpen, onClose, children, className, title, maxHeight = 85 }, ref) => {

    const handleDragEnd = (_: any, info: PanInfo) => {
      if (info.offset.y > 80 || info.velocity.y > 300) {
        onClose();
      }
    };

    return (
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              {...liquidBackdrop}
              className="liquid-modal-backdrop"
              onClick={onClose}
              style={{ zIndex: 9998 }}
            />

            {/* Sheet */}
            <motion.div
              ref={ref}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={liquidSpring}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.08}
              onDragEnd={handleDragEnd}
              className={cn(
                'fixed inset-x-0 z-[9999] liquid-glass-depth overflow-hidden rounded-t-3xl',
                className
              )}
              style={{
                bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
                maxHeight: `${maxHeight}vh`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top edge highlight */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent pointer-events-none z-10" />

              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <motion.div
                  className="w-10 h-1.5 rounded-full bg-foreground/20"
                  whileHover={{ scaleX: 1.3 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                />
              </div>

              {/* Header */}
              {title && (
                <div className="flex items-center justify-between px-5 py-3 border-b border-foreground/8">
                  <h2 className="text-lg font-semibold">{title}</h2>
                  <motion.button
                    onClick={onClose}
                    className="p-2 rounded-xl hover:bg-foreground/8 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </motion.button>
                </div>
              )}

              {/* Content */}
              <div
                className="overflow-y-auto overscroll-contain liquid-scroll relative z-10"
                style={{ maxHeight: `calc(${maxHeight}vh - 5rem)` }}
              >
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }
));

LiquidBottomSheet.displayName = 'LiquidBottomSheet';
