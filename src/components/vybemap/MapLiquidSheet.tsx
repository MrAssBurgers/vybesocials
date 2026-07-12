import { memo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MapLiquidSheetProps {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** e.g. "85vh" — default max-h-[85vh] */
  maxHeight?: string;
  title?: ReactNode;
  showHandle?: boolean;
}

/**
 * VybeMap bottom sheet — liquid glass over the map (z-2001), flush to bottom safe area.
 */
export const MapLiquidSheet = memo(function MapLiquidSheet({
  onClose,
  children,
  className,
  contentClassName,
  maxHeight = '85vh',
  title,
  showHandle = true,
}: MapLiquidSheetProps) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="liquid-modal-backdrop fixed inset-0 z-[2000]"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className={cn(
          'fixed inset-x-0 bottom-0 z-[2001] flex flex-col overflow-hidden',
          'liquid-glass-depth rounded-t-3xl border-b-0',
          className,
        )}
        style={{ maxHeight }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent pointer-events-none" />

        {showHandle && (
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-foreground/20" />
          </div>
        )}

        {title && (
          <div className="flex items-center justify-between gap-3 px-5 pb-2 shrink-0">
            <div className="min-w-0 flex-1">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full bg-foreground/8 hover:bg-foreground/12 flex items-center justify-center text-muted-foreground shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div
          className={cn(
            'flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
            contentClassName,
          )}
        >
          {children}
        </div>
      </motion.div>
    </>
  );
});
