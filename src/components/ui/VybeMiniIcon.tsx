import { memo } from 'react';
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
 * Uses CSS animations for iOS performance
 */
export const VybeMiniIcon = memo(function VybeMiniIcon({ 
  size = 16,
  className,
  animated = true,
  showSparkles = true,
}: VybeMiniIconProps) {
  const uniqueId = `vybe-mini-${++iconIdCounter}`;
  
  // Sparkle positions around the V - reduced from 6 to 4 for performance
  const sparkles = [
    { x: '85%', y: '15%', size: 3, delay: 0 },
    { x: '10%', y: '20%', size: 2, delay: 0.45 },
    { x: '90%', y: '60%', size: 2.5, delay: 0.9 },
    { x: '5%', y: '65%', size: 2, delay: 1.35 },
  ];
  
  return (
    <div 
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Floating sparkle dots around the V - CSS animations for iOS perf */}
      {showSparkles && (
        <>
          {sparkles.map((sparkle, i) => {
            const isAccent = i % 2 === 0;
            return (
              <div
                key={i}
                className={cn(
                  "absolute rounded-full",
                  animated && "animate-pulse"
                )}
                style={{ 
                  left: sparkle.x, 
                  top: sparkle.y,
                  width: sparkle.size,
                  height: sparkle.size,
                  background: isAccent 
                    ? 'hsl(var(--accent))' 
                    : 'hsl(var(--primary))',
                  opacity: animated ? undefined : 0.7,
                  animationDelay: animated ? `${sparkle.delay}s` : undefined,
                  animationDuration: animated ? '1.8s' : undefined,
                  transform: 'translateZ(0)',
                }}
              />
            );
          })}
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
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Right leg of V - outline stroke */}
        <path
          d="M78 15 L50 82"
          stroke={`url(#${uniqueId}-accent)`}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
