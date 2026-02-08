import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-10 w-10',
  };

  return (
    <div className={cn("flex flex-col items-center justify-center gap-2", className)}>
      <motion.div
        data-allow-animation="true"
        className={cn(
          "rounded-full border-2 border-primary/20 border-t-primary",
          sizes[size]
        )}
        animate={{ rotate: 360 }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      {label && (
        <span className="text-xs text-muted-foreground">{label}</span>
      )}
    </div>
  );
}

// Full page loader for route transitions
export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-4">
        <motion.div
          data-allow-animation="true"
          className="relative h-12 w-12"
        >
          {/* Outer ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-primary/20"
          />
          {/* Spinning ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          {/* Inner glow */}
          <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary/10 to-accent/10" />
        </motion.div>
        {message && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-muted-foreground"
          >
            {message}
          </motion.p>
        )}
      </div>
    </div>
  );
}

// Inline content loader
export function InlineLoader({ className }: { className?: string }) {
  return (
    <motion.div
      data-allow-animation="true"
      className={cn("flex items-center gap-1", className)}
    >
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-primary"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </motion.div>
  );
}

// Button loading state
export function ButtonLoader({ className }: { className?: string }) {
  return (
    <LoadingSpinner size="sm" className={className} />
  );
}
