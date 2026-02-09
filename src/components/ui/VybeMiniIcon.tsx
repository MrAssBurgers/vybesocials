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
        data-themed-svg="true"
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
            {/* Right side - top star */}
            <g 
              className={cn(animated && "animate-pulse")} 
              style={{ transformOrigin: '90px 18px', animationDuration: '2s' }}
            >
              <path
                d="M90 12 L91.5 16 L96 18 L91.5 20 L90 24 L88.5 20 L84 18 L88.5 16 Z"
                fill="hsl(var(--accent))"
              />
            </g>
            
            {/* Right side - bottom star */}
            <g 
              className={cn(animated && "animate-pulse")} 
              style={{ transformOrigin: '85px 50px', animationDuration: '2.3s', animationDelay: '0.5s' }}
            >
              <path
                d="M85 46 L86 49 L89 50 L86 51 L85 54 L84 51 L81 50 L84 49 Z"
                fill="hsl(var(--accent))"
              />
            </g>
            
            {/* Left side - top star */}
            <g 
              className={cn(animated && "animate-pulse")} 
              style={{ transformOrigin: '10px 18px', animationDuration: '2.2s', animationDelay: '0.3s' }}
            >
              <path
                d="M10 12 L11.5 16 L16 18 L11.5 20 L10 24 L8.5 20 L4 18 L8.5 16 Z"
                fill="hsl(var(--primary))"
              />
            </g>
            
            {/* Left side - bottom star */}
            <g 
              className={cn(animated && "animate-pulse")} 
              style={{ transformOrigin: '15px 50px', animationDuration: '2.5s', animationDelay: '0.7s' }}
            >
              <path
                d="M15 46 L16 49 L19 50 L16 51 L15 54 L14 51 L11 50 L14 49 Z"
                fill="hsl(var(--primary))"
              />
            </g>
          </>
        )}
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
