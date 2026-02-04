import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VybeMiniIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
  showSparkles?: boolean;
}

let iconIdCounter = 0;

/**
 * Mini VYBE "V" icon with optional sparkles - themed to user's primary/accent colors
 * Use this in place of Sparkles icons throughout the app
 */
export const VybeMiniIcon = memo(function VybeMiniIcon({ 
  size = 16,
  className,
  animated = true,
  showSparkles = true,
}: VybeMiniIconProps) {
  const uniqueId = `vybe-mini-${++iconIdCounter}`;
  
  return (
    <div 
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Sparkle particles around the V */}
      {showSparkles && animated && (
        <>
          {/* Top-right sparkle */}
          <motion.div
            className="absolute w-1 h-1 rounded-full bg-accent"
            style={{ top: '0%', right: '5%' }}
            animate={{ 
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              delay: 0,
              ease: 'easeInOut'
            }}
          />
          {/* Top-left sparkle */}
          <motion.div
            className="absolute w-0.5 h-0.5 rounded-full bg-primary"
            style={{ top: '10%', left: '10%' }}
            animate={{ 
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              delay: 0.5,
              ease: 'easeInOut'
            }}
          />
          {/* Right sparkle */}
          <motion.div
            className="absolute w-0.5 h-0.5 rounded-full bg-accent"
            style={{ top: '40%', right: '0%' }}
            animate={{ 
              scale: [0, 1, 0],
              opacity: [0, 1, 0],
            }}
            transition={{ 
              duration: 1.5, 
              repeat: Infinity, 
              delay: 1,
              ease: 'easeInOut'
            }}
          />
        </>
      )}
      
      {/* Static sparkle dots for non-animated version */}
      {showSparkles && !animated && (
        <>
          <div 
            className="absolute w-1 h-1 rounded-full bg-accent/70"
            style={{ top: '0%', right: '5%' }}
          />
          <div 
            className="absolute w-0.5 h-0.5 rounded-full bg-primary/70"
            style={{ top: '10%', left: '10%' }}
          />
        </>
      )}
      
      {/* The V icon - outline style */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        style={{ width: size * 0.85, height: size * 0.85 }}
      >
        <defs>
          {/* Primary gradient for left leg */}
          <linearGradient id={`${uniqueId}-primary`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.8)" />
          </linearGradient>
          
          {/* Accent gradient for right leg */}
          <linearGradient id={`${uniqueId}-accent`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="100%" stopColor="hsl(var(--accent) / 0.8)" />
          </linearGradient>
        </defs>
        
        {/* Left leg of V - outline stroke */}
        <path
          d="M22 15 L50 82"
          stroke={`url(#${uniqueId}-primary)`}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Right leg of V - outline stroke */}
        <path
          d="M78 15 L50 82"
          stroke={`url(#${uniqueId}-accent)`}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
