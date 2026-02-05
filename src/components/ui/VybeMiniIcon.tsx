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
 * Fun outline style with playful floating dots
 * Uses CSS animations for iOS performance
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
      {/* Playful floating dots */}
      {showSparkles && (
        <>
          <div
            className={cn("absolute rounded-full bg-accent", animated && "animate-bounce")}
            style={{ 
              right: '5%', 
              top: '10%',
              width: size * 0.15,
              height: size * 0.15,
              animationDuration: '2s',
              animationDelay: '0s',
            }}
          />
          <div
            className={cn("absolute rounded-full bg-primary", animated && "animate-bounce")}
            style={{ 
              left: '8%', 
              top: '20%',
              width: size * 0.12,
              height: size * 0.12,
              animationDuration: '2.5s',
              animationDelay: '0.5s',
            }}
          />
          <div
            className={cn("absolute rounded-full bg-accent/80", animated && "animate-bounce")}
            style={{ 
              left: '50%', 
              bottom: '2%',
              width: size * 0.1,
              height: size * 0.1,
              transform: 'translateX(-50%)',
              animationDuration: '2.2s',
              animationDelay: '1s',
            }}
          />
        </>
      )}
      
      {/* The V icon */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        style={{ width: size * 0.65, height: size * 0.65 }}
      >
        <defs>
          <linearGradient id={`${uniqueId}-primary`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.8)" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-accent`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="100%" stopColor="hsl(var(--accent) / 0.8)" />
          </linearGradient>
        </defs>
        
        <path
          d="M20 15 L50 85"
          stroke={`url(#${uniqueId}-primary)`}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M80 15 L50 85"
          stroke={`url(#${uniqueId}-accent)`}
          strokeWidth="14"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
