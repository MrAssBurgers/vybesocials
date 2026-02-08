import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type FeedbackState = 'idle' | 'loading' | 'success' | 'error';

interface ActionFeedbackProps {
  state: FeedbackState;
  successMessage?: string;
  errorMessage?: string;
  className?: string;
}

export function ActionFeedback({
  state,
  successMessage = 'Done!',
  errorMessage = 'Something went wrong',
  className,
}: ActionFeedbackProps) {
  if (state === 'idle') return null;

  const config = {
    loading: {
      icon: Loader2,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      message: null,
      animate: true,
    },
    success: {
      icon: Check,
      color: 'text-success',
      bgColor: 'bg-success/10',
      message: successMessage,
      animate: false,
    },
    error: {
      icon: AlertCircle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      message: errorMessage,
      animate: false,
    },
  };

  const current = config[state];
  const Icon = current.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={state}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.15 }}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg",
          current.bgColor,
          className
        )}
      >
        <motion.div
          animate={current.animate ? { rotate: 360 } : undefined}
          transition={current.animate ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : undefined}
          data-allow-animation="true"
        >
          <Icon className={cn("h-4 w-4", current.color)} />
        </motion.div>
        {current.message && (
          <span className={cn("text-sm font-medium", current.color)}>
            {current.message}
          </span>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Micro feedback - small indicator that appears briefly
export function MicroFeedback({
  show,
  type = 'success',
  onComplete,
}: {
  show: boolean;
  type?: 'success' | 'error';
  onComplete?: () => void;
}) {
  const config = {
    success: { icon: Check, color: 'text-success bg-success/20' },
    error: { icon: X, color: 'text-destructive bg-destructive/20' },
  };

  const current = config[type];
  const Icon = current.icon;

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', damping: 15 }}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full",
            current.color
          )}
        >
          <Icon className="h-4 w-4" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Pulse animation for like/action buttons
export function ActionPulse({ children, trigger }: { children: React.ReactNode; trigger: boolean }) {
  return (
    <motion.div
      animate={trigger ? { scale: [1, 1.2, 1] } : undefined}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
