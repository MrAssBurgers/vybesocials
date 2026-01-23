import { motion } from 'framer-motion';
import { Flame, Clock } from 'lucide-react';
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
  const isDying = hoursLeft !== null && hoursLeft <= 6;

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

  const clockSizes = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  };

  // Get flame color based on streak count (higher = hotter)
  const getFlameColor = () => {
    if (isDying) return 'text-orange-400/70'; // Faded when dying
    if (count >= 100) return 'text-accent';
    if (count >= 30) return 'text-primary';
    if (count >= 7) return 'text-orange-500';
    return 'text-yellow-500';
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'flex items-center font-bold',
        sizeClasses[size],
        getFlameColor()
      )}
    >
      {/* Gentle pulsing fire with glow */}
      <motion.div
        className="relative"
        animate={{ 
          scale: isDying ? [1, 0.96, 1] : [1, 1.06, 1],
          y: isDying ? 0 : [0, -0.5, 0],
        }}
        transition={{ 
          repeat: Infinity, 
          duration: isDying ? 2 : 1.2,
          ease: "easeInOut"
        }}
        style={{
          filter: isDying 
            ? 'drop-shadow(0 0 2px currentColor)' 
            : 'drop-shadow(0 0 4px currentColor)'
        }}
      >
        <Flame className={cn(iconSizes[size], 'fill-current', isDying && 'opacity-60')} />
      </motion.div>

      {/* Expiry clock when dying */}
      {isDying && hoursLeft !== null && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative ml-0.5"
        >
          <motion.div
            animate={{ 
              scale: isExpiringSoon ? [1, 1.1, 1] : 1,
              opacity: isExpiringSoon ? [1, 0.6, 1] : 0.8
            }}
            transition={{ 
              repeat: Infinity, 
              duration: isExpiringSoon ? 0.8 : 2 
            }}
          >
            <Clock className={cn(
              clockSizes[size], 
              isExpiringSoon ? 'text-red-500' : 'text-orange-400'
            )} />
          </motion.div>
        </motion.div>
      )}
      
      {/* Streak count */}
      <motion.span
        key={count}
        initial={{ scale: 1.3, y: -2 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className={cn(isDying && 'opacity-70')}
      >
        {count}
      </motion.span>
      
      {showExpiry && hoursLeft !== null && hoursLeft <= 24 && (
        <span className={cn(
          'text-[10px] ml-1',
          isExpiringSoon ? 'text-red-500 animate-pulse' : 'text-muted-foreground'
        )}>
          ({hoursLeft}h)
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
