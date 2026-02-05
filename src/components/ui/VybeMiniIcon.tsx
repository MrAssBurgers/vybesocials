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
  * Clean outline style with subtle floating sparkle accents
 * Uses CSS animations for iOS performance
 */
export const VybeMiniIcon = memo(function VybeMiniIcon({ 
  size = 16,
  className,
  animated = true,
  showSparkles = true,
}: VybeMiniIconProps) {
  const uniqueId = `vybe-mini-${++iconIdCounter}`;
  
  // Minimal sparkles - just 3 subtle accents
  const sparkles = [
    { x: '88%', y: '12%', s: 2.5, delay: 0, accent: true },
    { x: '12%', y: '18%', s: 2, delay: 0.6, accent: false },
    { x: '50%', y: '92%', s: 2, delay: 1.2, accent: true },
  ];
  
  return (
    <div 
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Subtle sparkle accents */}
      {showSparkles && (
        sparkles.map((sp, i) => (
          <div
            key={i}
            className={cn(
              "absolute rounded-full",
              animated && "animate-pulse"
            )}
            style={{ 
              left: sp.x, 
              top: sp.y,
              width: sp.s,
              height: sp.s,
              transform: 'translate(-50%, -50%)',
              background: sp.accent ? 'hsl(var(--accent))' : 'hsl(var(--primary))',
              opacity: 0.85,
              animationDelay: `${sp.delay}s`,
              animationDuration: '2.5s',
            }}
          />
        ))
      )}
      
      {/* The V icon - outline style, no background */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        style={{ width: size * 0.7, height: size * 0.7 }}
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
          d="M22 15 L50 82"
          stroke={`url(#${uniqueId}-primary)`}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
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
