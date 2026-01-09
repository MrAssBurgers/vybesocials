import { forwardRef, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { X } from 'lucide-react';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
  title?: string;
}

export const GlassModal = forwardRef<HTMLDivElement, GlassModalProps>(
  ({ isOpen, onClose, children, className, showCloseButton = true, title }, ref) => {
    const { reduceMotion } = useAccessibility();

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

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
              <motion.div
                ref={ref}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: [0.4, 0, 0.2, 1] }}
                className={cn(
                  'liquid-glass rounded-2xl overflow-hidden pointer-events-auto w-full max-w-md',
                  className
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                {(title || showCloseButton) && (
                  <div className="flex items-center justify-between p-4 border-b border-foreground/5">
                    {title && <h2 className="text-lg font-semibold">{title}</h2>}
                    {showCloseButton && (
                      <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-foreground/5 transition-colors ml-auto"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}

                {/* Content */}
                <div className="p-4">
                  {children}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    );
  }
);

GlassModal.displayName = 'GlassModal';
