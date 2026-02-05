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
 * Cool outline style with twinkling star sparkles
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
      {/* The V icon with star sparkles */}
      <svg
        viewBox="0 0 100 110"
        fill="none"
        style={{ width: size, height: size }}
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
        
        {/* Left leg of V */}
        <path
          d="M25 20 L50 90"
          stroke={`url(#${uniqueId}-primary)`}
          strokeWidth="12"
          strokeLinecap="round"
        />
        
        {/* Right leg of V */}
        <path
          d="M75 20 L50 90"
          stroke={`url(#${uniqueId}-accent)`}
          strokeWidth="12"
          strokeLinecap="round"
        />
        
        {/* Star sparkles ✦ */}
        {showSparkles && (
          <>
            {/* Top right star - accent color, larger */}
            <g 
              className={cn(animated && "animate-pulse")} 
              style={{ transformOrigin: '88px 12px', animationDuration: '2s' }}
            >
              <path
                d="M88 6 L89.5 10 L94 12 L89.5 14 L88 18 L86.5 14 L82 12 L86.5 10 Z"
                fill="hsl(var(--accent))"
              />
            </g>
            
            {/* Top left star - primary color, medium */}
            <g 
              className={cn(animated && "animate-pulse")} 
              style={{ transformOrigin: '12px 16px', animationDuration: '2.5s', animationDelay: '0.4s' }}
            >
              <path
                d="M12 11 L13.2 14 L16.5 16 L13.2 18 L12 21 L10.8 18 L7.5 16 L10.8 14 Z"
                fill="hsl(var(--primary))"
              />
            </g>
            
            {/* Bottom center star - accent, small */}
            <g 
              className={cn(animated && "animate-pulse")} 
              style={{ transformOrigin: '50px 104px', animationDuration: '2.2s', animationDelay: '0.8s' }}
            >
              <path
                d="M50 100 L51 102.5 L54 104 L51 105.5 L50 108 L49 105.5 L46 104 L49 102.5 Z"
                fill="hsl(var(--accent))"
              />
            </g>
          </>
        )}
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
