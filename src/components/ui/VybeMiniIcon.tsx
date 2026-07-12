import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useVybeMarkColors } from '@/hooks/useVybeMarkColors';

interface VybeMiniIconProps {
  size?: number;
  className?: string;
  animated?: boolean;
  showSparkles?: boolean;
}

/**
 * Mini VYBE "V" icon with sparkles — uses resolved theme HSL (WebKit-safe).
 * CSS variables inside SVG gradient stops do not repaint when the theme changes.
 */
export const VybeMiniIcon = memo(function VybeMiniIcon({
  size = 16,
  className,
  animated = true,
  showSparkles = true,
}: VybeMiniIconProps) {
  const colors = useVybeMarkColors();

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 110"
        fill="none"
        data-themed-svg="true"
        style={{ width: size, height: size }}
      >
        <path
          d="M25 20 L50 90"
          stroke={colors.primary}
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M75 20 L50 90"
          stroke={colors.accent}
          strokeWidth="12"
          strokeLinecap="round"
        />

        {showSparkles && (
          <>
            <g
              className={cn(animated && 'animate-pulse')}
              style={{ transformOrigin: '90px 18px', animationDuration: '2s' }}
            >
              <path
                d="M90 12 L91.5 16 L96 18 L91.5 20 L90 24 L88.5 20 L84 18 L88.5 16 Z"
                fill={colors.accent}
              />
            </g>
            <g
              className={cn(animated && 'animate-pulse')}
              style={{ transformOrigin: '85px 50px', animationDuration: '2.3s', animationDelay: '0.5s' }}
            >
              <path
                d="M85 46 L86 49 L89 50 L86 51 L85 54 L84 51 L81 50 L84 49 Z"
                fill={colors.accent}
              />
            </g>
            <g
              className={cn(animated && 'animate-pulse')}
              style={{ transformOrigin: '10px 18px', animationDuration: '2.2s', animationDelay: '0.3s' }}
            >
              <path
                d="M10 12 L11.5 16 L16 18 L11.5 20 L10 24 L8.5 20 L4 18 L8.5 16 Z"
                fill={colors.primary}
              />
            </g>
            <g
              className={cn(animated && 'animate-pulse')}
              style={{ transformOrigin: '15px 50px', animationDuration: '2.5s', animationDelay: '0.7s' }}
            >
              <path
                d="M15 46 L16 49 L19 50 L16 51 L15 54 L14 51 L11 50 L14 49 Z"
                fill={colors.primary}
              />
            </g>
          </>
        )}
      </svg>
    </div>
  );
});

export default VybeMiniIcon;
