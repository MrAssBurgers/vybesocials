import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StreakIndicatorProps {
  count: number;
  expiresAt?: string;
  size?: 'sm' | 'md' | 'lg';
  showExpiry?: boolean;
}

export function StreakIndicator({ 
  count, 
  expiresAt, 
  size = 'md',
  showExpiry = false 
}: StreakIndicatorProps) {
  const hoursLeft = expiresAt 
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60)))
    : null;

  const isExpiringSoon = hoursLeft !== null && hoursLeft <= 3;

  const sizeClasses = {
    sm: 'text-xs gap-0.5',
    md: 'text-sm gap-1',
    lg: 'text-base gap-1.5',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  // Get flame color based on streak count (higher = hotter)
  const getFlameColor = () => {
    if (count >= 100) return 'text-accent'; // Accent for legendary 100+
    if (count >= 30) return 'text-primary'; // Primary for 30+
    if (count >= 7) return 'text-orange-500'; // Orange for 7+
    return 'text-yellow-500'; // Yellow for beginners
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'flex items-center font-bold',
        sizeClasses[size],
        isExpiringSoon ? 'text-orange-500' : getFlameColor()
      )}
    >
      {/* Pulsing fire with glow effect */}
      <motion.div
        className="relative"
        animate={{ 
          scale: [1, 1.15, 1],
          filter: [
            'drop-shadow(0 0 2px currentColor)',
            'drop-shadow(0 0 8px currentColor)',
            'drop-shadow(0 0 2px currentColor)'
          ]
        }}
        transition={{ 
          repeat: Infinity, 
          duration: isExpiringSoon ? 0.5 : 1.5,
          ease: "easeInOut"
        }}
      >
        <Flame className={cn(iconSizes[size], 'fill-current')} />
      </motion.div>
      
      {/* Streak count with subtle animation */}
      <motion.span
        key={count}
        initial={{ scale: 1.3, y: -2 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      >
        {count}
      </motion.span>
      
      {showExpiry && hoursLeft !== null && hoursLeft <= 24 && (
        <span className={cn(
          'text-[10px] ml-1',
          isExpiringSoon ? 'text-red-500 animate-pulse' : 'text-muted-foreground'
        )}>
          ({hoursLeft}h left)
        </span>
      )}
    </motion.div>
  );
}

// Milestone celebrations
export function StreakMilestone({ count }: { count: number }) {
  const milestones = [7, 30, 100, 365];
  const isMilestone = milestones.includes(count);

  if (!isMilestone) return null;

  const getEmoji = () => {
    if (count >= 365) return '💎';
    if (count >= 100) return '🏆';
    if (count >= 30) return '🌟';
    return '🎉';
  };

  const getColor = () => {
    if (count >= 365) return 'from-accent/20 to-accent/10';
    if (count >= 100) return 'from-primary/20 to-accent/20';
    if (count >= 30) return 'from-orange-500/20 to-primary/20';
    return 'from-yellow-500/20 to-orange-500/20';
  };

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      className={cn(
        "flex items-center gap-2 bg-gradient-to-r rounded-full px-4 py-2",
        getColor()
      )}
    >
      <motion.span 
        className="text-2xl"
        animate={{ 
          rotate: [0, 10, -10, 0],
          scale: [1, 1.1, 1]
        }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        {getEmoji()}
      </motion.span>
      <div>
        <p className="font-bold text-foreground">{count} Day Streak!</p>
        <p className="text-xs text-muted-foreground">Keep the fire alive!</p>
      </div>
    </motion.div>
  );
}
