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

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        'flex items-center font-bold',
        sizeClasses[size],
        isExpiringSoon ? 'text-orange-500' : 'text-yellow-500'
      )}
    >
      <motion.div
        animate={isExpiringSoon ? { 
          scale: [1, 1.2, 1],
          rotate: [-5, 5, -5, 0],
        } : {}}
        transition={{ 
          repeat: isExpiringSoon ? Infinity : 0, 
          duration: 0.5 
        }}
      >
        <Flame className={cn(iconSizes[size], 'fill-current')} />
      </motion.div>
      <span>{count}</span>
      
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

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      className="flex items-center gap-2 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 rounded-full px-4 py-2"
    >
      <span className="text-2xl">{getEmoji()}</span>
      <div>
        <p className="font-bold text-foreground">{count} Day Streak!</p>
        <p className="text-xs text-muted-foreground">Keep the fire alive!</p>
      </div>
    </motion.div>
  );
}
