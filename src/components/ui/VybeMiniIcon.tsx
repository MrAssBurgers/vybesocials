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
 * Premium outline style with elegant twinkling star accents
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
      {/* The V icon with integrated sparkle stars */}
      <svg
        viewBox="0 0 120 120"
        fill="none"
        style={{ width: size, height: size }}
      >
        <defs>
          <linearGradient id={`${uniqueId}-primary`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.75)" />
          </linearGradient>
          <linearGradient id={`${uniqueId}-accent`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="100%" stopColor="hsl(var(--accent) / 0.75)" />
          </linearGradient>
        </defs>
        
        {/* Left leg of V */}
        <path
          d="M32 25 L60 95"
          stroke={`url(#${uniqueId}-primary)`}
          strokeWidth="12"
          strokeLinecap="round"
        />
        
        {/* Right leg of V */}
        <path
          d="M88 25 L60 95"
          stroke={`url(#${uniqueId}-accent)`}
          strokeWidth="12"
          strokeLinecap="round"
        />
        
        {/* Sparkle stars - 4-point star shapes */}
        {showSparkles && (
          <g className={animated ? 'animate-pulse' : ''} style={{ animationDuration: '3s' }}>
            {/* Top right star */}
            <path
              d="M100 18 L102 22 L106 24 L102 26 L100 30 L98 26 L94 24 L98 22 Z"
              fill="hsl(var(--accent))"
              opacity="0.9"
            />
            {/* Top left star - smaller */}
            <path
              d="M18 22 L19.5 25 L22.5 26.5 L19.5 28 L18 31 L16.5 28 L13.5 26.5 L16.5 25 Z"
              fill="hsl(var(--primary))"
              opacity="0.8"
            />
            {/* Bottom star - tiny accent */}
            <path
              d="M60 108 L61 110.5 L63.5 112 L61 113.5 L60 116 L59 113.5 L56.5 112 L59 110.5 Z"
              fill="hsl(var(--accent))"
              opacity="0.7"
            />
          </g>
        )}
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
