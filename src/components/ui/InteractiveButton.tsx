import { forwardRef, ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { sounds } from '@/lib/sounds';
import { MOTION_CONFIG } from '@/lib/motion';
import { Button, ButtonProps } from '@/components/ui/button';

interface InteractiveButtonProps extends Omit<ButtonProps, 'asChild'> {
  hapticStyle?: 'light' | 'medium' | 'heavy';
  soundEnabled?: boolean;
  children: ReactNode;
}

// Interactive button with micro-animations, haptics, and sound
export const InteractiveButton = forwardRef<HTMLButtonElement, InteractiveButtonProps>(
  ({ className, hapticStyle = 'light', soundEnabled = true, onClick, children, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Trigger haptic feedback
      haptics[hapticStyle === 'light' ? 'tap' : hapticStyle === 'medium' ? 'select' : 'impact']();
      
      // Play sound if enabled
      if (soundEnabled) {
        sounds.tap();
      }
      
      // Call original onClick
      onClick?.(e);
    };

    return (
      <motion.div
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        transition={MOTION_CONFIG.spring.snappy}
        className="inline-block"
      >
        <Button
          ref={ref}
          className={cn('transition-all', className)}
          onClick={handleClick}
          {...props}
        >
          {children}
        </Button>
      </motion.div>
    );
  }
);

InteractiveButton.displayName = 'InteractiveButton';

// Motion wrapper for any clickable element
interface MotionPressableProps extends HTMLMotionProps<'div'> {
  haptic?: boolean;
  hapticStyle?: 'light' | 'medium' | 'heavy';
  sound?: boolean;
}

export const MotionPressable = forwardRef<HTMLDivElement, MotionPressableProps>(
  ({ haptic = true, hapticStyle = 'light', sound = false, onClick, children, className, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (haptic) {
        haptics[hapticStyle === 'light' ? 'tap' : hapticStyle === 'medium' ? 'select' : 'impact']();
      }
      if (sound) {
        sounds.tap();
      }
      onClick?.(e);
    };

    return (
      <motion.div
        ref={ref}
        whileTap={{ scale: 0.96 }}
        whileHover={{ scale: 1.02 }}
        transition={MOTION_CONFIG.spring.snappy}
        onClick={handleClick}
        className={cn('cursor-pointer', className)}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

MotionPressable.displayName = 'MotionPressable';

// Like button with heart pop animation
interface LikeButtonProps {
  isLiked: boolean;
  onClick: () => void;
  count?: number;
  className?: string;
}

export function LikeButton({ isLiked, onClick, count, className }: LikeButtonProps) {
  const handleClick = () => {
    haptics.like();
    if (!isLiked) {
      sounds.pop();
    }
    onClick();
  };

  return (
    <motion.button
      onClick={handleClick}
      className={cn('flex items-center gap-1.5 transition-colors', className)}
      whileTap={{ scale: 0.9 }}
    >
      <motion.span
        animate={isLiked ? { scale: [1, 1.3, 0.9, 1.1, 1] } : { scale: 1 }}
        transition={{ duration: 0.4 }}
        className={cn(
          'text-lg',
          isLiked ? 'text-red-500' : 'text-muted-foreground'
        )}
      >
        {isLiked ? '❤️' : '🤍'}
      </motion.span>
      {count !== undefined && (
        <span className={cn('text-sm', isLiked ? 'text-red-500' : 'text-muted-foreground')}>
          {count}
        </span>
      )}
    </motion.button>
  );
}

// Save button with fold animation
interface SaveButtonProps {
  isSaved: boolean;
  onClick: () => void;
  className?: string;
}

export function SaveButton({ isSaved, onClick, className }: SaveButtonProps) {
  const handleClick = () => {
    haptics.select();
    sounds.success();
    onClick();
  };

  return (
    <motion.button
      onClick={handleClick}
      className={cn('transition-colors', className)}
      whileTap={{ scale: 0.9 }}
    >
      <motion.span
        animate={isSaved ? { rotateX: [0, -30, 0] } : { rotateX: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'text-lg inline-block',
          isSaved ? 'text-primary' : 'text-muted-foreground'
        )}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {isSaved ? '🔖' : '📑'}
      </motion.span>
    </motion.button>
  );
}

// Share button with fly animation
interface ShareButtonProps {
  onClick: () => void;
  className?: string;
}

export function ShareButton({ onClick, className }: ShareButtonProps) {
  const handleClick = () => {
    haptics.tap();
    sounds.send();
    onClick();
  };

  return (
    <motion.button
      onClick={handleClick}
      className={cn('text-lg text-muted-foreground transition-colors hover:text-foreground', className)}
      whileTap={{ scale: 0.9, x: 5, y: -5 }}
      transition={MOTION_CONFIG.spring.snappy}
    >
      📤
    </motion.button>
  );
}
