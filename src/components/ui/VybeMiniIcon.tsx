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
 * Mini VYBE "V" icon with sparkles - themed to user's primary/accent colors
 * Outline style with floating sparkle dots around the V
 */
export const VybeMiniIcon = memo(function VybeMiniIcon({ 
  size = 16,
  className,
  animated = true,
  showSparkles = true,
}: VybeMiniIconProps) {
  const uniqueId = `vybe-mini-${++iconIdCounter}`;
  
  // Sparkle positions around the V
  const sparkles = [
    { x: '85%', y: '10%', size: 3, delay: 0 },
    { x: '10%', y: '15%', size: 2, delay: 0.3 },
    { x: '90%', y: '45%', size: 2.5, delay: 0.6 },
    { x: '5%', y: '50%', size: 2, delay: 0.9 },
    { x: '75%', y: '75%', size: 2, delay: 0.4 },
    { x: '25%', y: '70%', size: 1.5, delay: 0.7 },
  ];
  
  return (
    <div 
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Floating sparkle dots around the V */}
      {showSparkles && (
        <>
          {sparkles.map((sparkle, i) => (
            animated ? (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{ 
                  left: sparkle.x, 
                  top: sparkle.y,
                  width: sparkle.size,
                  height: sparkle.size,
                  background: i % 2 === 0 
                    ? 'hsl(var(--accent))' 
                    : 'hsl(var(--primary))',
                }}
                animate={{ 
                  scale: [0.5, 1, 0.5],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{ 
                  duration: 1.8, 
                  repeat: Infinity, 
                  delay: sparkle.delay,
                  ease: 'easeInOut'
                }}
              />
            ) : (
              <div
                key={i}
                className="absolute rounded-full"
                style={{ 
                  left: sparkle.x, 
                  top: sparkle.y,
                  width: sparkle.size,
                  height: sparkle.size,
                  background: i % 2 === 0 
                    ? 'hsl(var(--accent) / 0.7)' 
                    : 'hsl(var(--primary) / 0.7)',
                }}
              />
            )
          ))}
        </>
      )}
      
      {/* The V icon - outline style, no background */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        style={{ width: size * 0.7, height: size * 0.7 }}
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
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Right leg of V - outline stroke */}
        <path
          d="M78 15 L50 82"
          stroke={`url(#${uniqueId}-accent)`}
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
