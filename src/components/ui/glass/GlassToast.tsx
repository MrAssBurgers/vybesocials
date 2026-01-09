import { forwardRef, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAccessibility } from '@/providers/AccessibilityProvider';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

interface GlassToastProps {
  type?: 'success' | 'error' | 'info' | 'warning';
  title?: string;
  description?: string;
  onClose?: () => void;
  className?: string;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const iconColors = {
  success: 'text-success',
  error: 'text-destructive',
  info: 'text-primary',
  warning: 'text-warning',
};

export const GlassToast = forwardRef<HTMLDivElement, GlassToastProps>(
  ({ type = 'info', title, description, onClose, className }, ref) => {
    const { reduceMotion } = useAccessibility();
    const Icon = icons[type];

    return (
      <motion.div
        ref={ref}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          'liquid-glass rounded-xl p-4 flex items-start gap-3 min-w-[300px] max-w-[400px]',
          className
        )}
      >
        <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', iconColors[type])} />
        
        <div className="flex-1 min-w-0">
          {title && <p className="font-medium text-sm">{title}</p>}
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-foreground/5 transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </motion.div>
    );
  }
);

GlassToast.displayName = 'GlassToast';
