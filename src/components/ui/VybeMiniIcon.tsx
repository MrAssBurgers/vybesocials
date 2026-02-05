import { memo, useMemo } from 'react';
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
  const uniqueId = useMemo(() => `vybe-mini-${++iconIdCounter}`, []);
  
  // Sparkle positions strategically placed around the V shape
  const sparkles = [
    // Top corners - bright accents
    { x: '92%', y: '8%', baseSize: 0.22, delay: 0, isAccent: true },
    { x: '8%', y: '12%', baseSize: 0.18, delay: 0.3, isAccent: false },
    // Mid sides - smaller sparkles
    { x: '95%', y: '45%', baseSize: 0.15, delay: 0.6, isAccent: false },
    { x: '5%', y: '50%', baseSize: 0.15, delay: 0.9, isAccent: true },
    // Near bottom point - larger glow
    { x: '50%', y: '95%', baseSize: 0.2, delay: 1.2, isAccent: true },
    // Extra sparkle at tip
    { x: '65%', y: '75%', baseSize: 0.12, delay: 1.5, isAccent: false },
  ];
  
  return (
    <div 
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {/* Floating sparkle dots around the V - CSS animations for iOS perf */}
      {showSparkles && (
        <>
          {sparkles.map((sparkle, i) => (
            <div
              key={i}
              className="absolute"
              style={{ 
                left: sparkle.x, 
                top: sparkle.y,
                transform: 'translate(-50%, -50%) translateZ(0)',
              }}
            >
              {/* Outer glow layer */}
              <div
                className={cn(
                  "absolute rounded-full blur-[1px]",
                  animated && "animate-pulse",
                  sparkle.isAccent ? "bg-accent/40" : "bg-primary/40"
                )}
                style={{ 
                  width: size * sparkle.baseSize * 1.8,
                  height: size * sparkle.baseSize * 1.8,
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  animationDelay: `${sparkle.delay}s`,
                  animationDuration: '2s',
                }}
              />
              {/* Core sparkle - bright center */}
              <div
                className={cn(
                  "relative rounded-full",
                  animated && "animate-pulse"
                )}
                style={{ 
                  width: size * sparkle.baseSize,
                  height: size * sparkle.baseSize,
                  background: sparkle.isAccent 
                    ? 'hsl(var(--accent))' 
                    : 'hsl(var(--primary))',
                  boxShadow: sparkle.isAccent
                    ? '0 0 4px 1px hsl(var(--accent) / 0.6), 0 0 8px 2px hsl(var(--accent) / 0.3)'
                    : '0 0 4px 1px hsl(var(--primary) / 0.6), 0 0 8px 2px hsl(var(--primary) / 0.3)',
                  animationDelay: `${sparkle.delay}s`,
                  animationDuration: '2s',
                }}
              />
            </div>
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
            <stop offset="0%" stopColor="hsl(var(--primary) / 1)" />
            <stop offset="100%" stopColor="hsl(var(--primary) / 0.85)" />
          </linearGradient>
          
          {/* Accent gradient for right leg */}
          <linearGradient id={`${uniqueId}-accent`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--accent) / 1)" />
            <stop offset="100%" stopColor="hsl(var(--accent) / 0.85)" />
          </linearGradient>
          
          {/* Glow filter for the V strokes */}
          <filter id={`${uniqueId}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Left leg of V - outline stroke */}
        <path
          d="M22 15 L50 82"
          stroke={`url(#${uniqueId}-primary)`}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          filter={`url(#${uniqueId}-glow)`}
        />
        
        {/* Right leg of V - outline stroke */}
        <path
          d="M78 15 L50 82"
          stroke={`url(#${uniqueId}-accent)`}
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
          filter={`url(#${uniqueId}-glow)`}
        />
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
