import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FounderBadgeProps {
  /** Which tier: 'legendary' (first 100), 'elite' (first 500), 'founder' (first 1000) */
  tier?: 'legendary' | 'elite' | 'founder';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'showcase';
  showTooltip?: boolean;
  className?: string;
  /** If true, shows the badge in a "locked/unclaimed" state */
  locked?: boolean;
}

const TIER_CONFIG = {
  legendary: {
    label: 'Legendary Founder',
    description: 'One of the first 100 VYBE users',
    borderGradient: ['#ff2d78', '#a855f7', '#06d6a0'],
    glowColor: 'rgba(168, 85, 247, 0.6)',
    vGradient: ['#ff2d78', '#c084fc', '#22d3ee'],
  },
  elite: {
    label: 'Elite Founder',
    description: 'One of the first 500 VYBE users',
    borderGradient: ['#ec4899', '#8b5cf6', '#06b6d4'],
    glowColor: 'rgba(139, 92, 246, 0.5)',
    vGradient: ['#ec4899', '#a78bfa', '#22d3ee'],
  },
  founder: {
    label: 'VYBE Founder',
    description: 'One of the first 1,000 VYBE users',
    borderGradient: ['#d946ef', '#7c3aed', '#0891b2'],
    glowColor: 'rgba(124, 58, 237, 0.4)',
    vGradient: ['#d946ef', '#8b5cf6', '#06b6d4'],
  },
};

const SIZE_MAP = {
  xs: { width: 16, height: 18 },
  sm: { width: 20, height: 23 },
  md: { width: 26, height: 30 },
  lg: { width: 34, height: 39 },
  xl: { width: 56, height: 64 },
  showcase: { width: 120, height: 138 },
};

/**
 * FounderBadge — Premium hexagonal shield badge with metallic gradient border,
 * matte black interior, glowing "V" icon, and subtle shimmer sweep animation.
 * Renders as inline SVG for crisp scaling at any size.
 */
export const FounderBadge = memo(function FounderBadge({
  tier = 'founder',
  size = 'sm',
  showTooltip = true,
  className,
  locked = false,
}: FounderBadgeProps) {
  const config = TIER_CONFIG[tier];
  const dims = SIZE_MAP[size];
  const gradientId = useMemo(() => `fb-${Math.random().toString(36).slice(2, 7)}`, []);

  const badge = (
    <motion.span
      className={cn('inline-flex items-center justify-center shrink-0', locked && 'opacity-40', className)}
      whileHover={locked ? undefined : { scale: 1.12 }}
      style={{ width: dims.width, height: dims.height }}
    >
      <svg
        viewBox="0 0 120 138"
        width={dims.width}
        height={dims.height}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-sm"
      >
        <defs>
          {/* Metallic border gradient: pink → purple → cyan */}
          <linearGradient id={`border-${gradientId}`} x1="0" y1="0" x2="120" y2="138" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.borderGradient[0]} />
            <stop offset="50%" stopColor={config.borderGradient[1]} />
            <stop offset="100%" stopColor={config.borderGradient[2]} />
          </linearGradient>

          {/* V glow gradient */}
          <linearGradient id={`v-${gradientId}`} x1="35" y1="35" x2="85" y2="95" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={config.vGradient[0]} />
            <stop offset="50%" stopColor={config.vGradient[1]} />
            <stop offset="100%" stopColor={config.vGradient[2]} />
          </linearGradient>

          {/* Shimmer sweep */}
          <linearGradient id={`shimmer-${gradientId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.25)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-1 -1; 1.5 1.5"
              dur="4.5s"
              repeatCount="indefinite"
            />
          </linearGradient>

          {/* Inner glow filter */}
          <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feComposite in="blur" in2="SourceGraphic" operator="over" />
          </filter>

          {/* Hexagon clip path */}
          <clipPath id={`hex-clip-${gradientId}`}>
            <polygon points="60,3 113,34 113,104 60,135 7,104 7,34" />
          </clipPath>
        </defs>

        {/* Outer hexagonal border */}
        <polygon
          points="60,1 115,33 115,105 60,137 5,105 5,33"
          fill={`url(#border-${gradientId})`}
        />

        {/* Inner matte black hexagon */}
        <polygon
          points="60,8 108,37 108,101 60,130 12,101 12,37"
          fill="#0d0d14"
        />

        {/* Subtle inner border highlight */}
        <polygon
          points="60,8 108,37 108,101 60,130 12,101 12,37"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.8"
        />

        {/* Center "V" with glow */}
        <g filter={`url(#glow-${gradientId})`}>
          <path
            d="M 42 38 L 60 88 L 78 38"
            stroke={`url(#v-${gradientId})`}
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Small white dot accent below V */}
        <circle cx="60" cy="98" r="2" fill="rgba(255,255,255,0.7)" />

        {/* Shimmer sweep overlay */}
        <polygon
          points="60,8 108,37 108,101 60,130 12,101 12,37"
          fill={`url(#shimmer-${gradientId})`}
        />

        {/* Soft glow pulse on the V (only for non-locked) */}
        {!locked && (
          <circle cx="60" cy="65" r="20" fill={config.glowColor} opacity="0.15">
            <animate
              attributeName="opacity"
              values="0.1;0.25;0.1"
              dur="3s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="18;22;18"
              dur="3s"
              repeatCount="indefinite"
            />
          </circle>
        )}
      </svg>
    </motion.span>
  );

  if (!showTooltip) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" align="center" sideOffset={6} collisionPadding={12} className="max-w-[200px] z-[9999]">
          <p className="font-semibold text-sm">{config.label}</p>
          <p className="text-xs text-muted-foreground">{config.description}</p>
          {locked && <p className="text-xs text-primary mt-1">🔒 Not yet claimed</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

/**
 * Determines which founder tier a user belongs to based on their position number.
 */
export function getFounderTier(position: number): 'legendary' | 'elite' | 'founder' | null {
  if (position <= 0) return null;
  if (position <= 100) return 'legendary';
  if (position <= 500) return 'elite';
  if (position <= 1000) return 'founder';
  return null;
}
