import { ReactNode, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureTooltipProps {
  id: string; // Unique ID to track if user has seen this
  title: string;
  description: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number; // Delay before showing in ms
  showOnce?: boolean; // Only show once ever
  className?: string;
}

const SEEN_TOOLTIPS_KEY = 'vybe-seen-tooltips';

function getSeenTooltips(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_TOOLTIPS_KEY) || '[]');
  } catch {
    return [];
  }
}

function markTooltipSeen(id: string) {
  const seen = getSeenTooltips();
  if (!seen.includes(id)) {
    seen.push(id);
    localStorage.setItem(SEEN_TOOLTIPS_KEY, JSON.stringify(seen));
  }
}

export function FeatureTooltip({
  id,
  title,
  description,
  children,
  position = 'top',
  delay = 500,
  showOnce = true,
  className,
}: FeatureTooltipProps) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (showOnce) {
      const seen = getSeenTooltips();
      if (seen.includes(id)) {
        setDismissed(true);
        return;
      }
    }

    const timer = setTimeout(() => {
      setShow(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [id, delay, showOnce]);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    markTooltipSeen(id);
  };

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-primary/20',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-primary/20',
    left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-primary/20',
    right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-primary/20',
  };

  return (
    <div className={cn("relative inline-block", className)}>
      {children}
      
      <AnimatePresence>
        {show && !dismissed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 5 : position === 'bottom' ? -5 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute z-50 w-56 p-3 rounded-xl",
              "liquid-glass-card border border-primary/20",
              "shadow-lg shadow-primary/10",
              positionClasses[position]
            )}
          >
            {/* Arrow */}
            <div className={cn(
              "absolute w-0 h-0 border-8",
              arrowClasses[position]
            )} />

            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 rounded-md hover:bg-muted/50 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Simpler inline hint for less prominent features
export function FeatureHint({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint: string;
  className?: string;
}) {
  const [showHint, setShowHint] = useState(false);

  return (
    <div
      className={cn("relative group", className)}
      onMouseEnter={() => setShowHint(true)}
      onMouseLeave={() => setShowHint(false)}
      onFocus={() => setShowHint(true)}
      onBlur={() => setShowHint(false)}
    >
      {children}
      
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-50 bottom-full mb-2 left-1/2 -translate-x-1/2 px-2.5 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium whitespace-nowrap"
          >
            {hint}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
