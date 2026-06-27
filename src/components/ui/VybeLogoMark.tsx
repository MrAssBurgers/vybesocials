import { memo } from 'react';
import { VybeLogo, type VybeLogoProps } from '@/components/brand/VybeLogo';
import { cn } from '@/lib/utils';

export interface VybeLogoMarkProps extends Omit<VybeLogoProps, 'size'> {
  className?: string;
  /** @deprecated use size via className width/height or pass through parent */
  strokeWidth?: number;
  glow?: boolean;
}

const SIZE_FROM_CLASS: Record<string, number> = {
  'w-6': 24,
  'h-6': 24,
  'w-7': 28,
  'h-7': 28,
  'w-8': 32,
  'h-8': 32,
  'w-10': 40,
  'h-10': 40,
  'w-16': 64,
  'h-16': 64,
  'w-20': 80,
  'h-20': 80,
  'w-24': 96,
  'h-24': 96,
  'w-32': 128,
  'h-32': 128,
};

function inferSize(className?: string): number {
  if (!className) return 48;
  for (const [token, px] of Object.entries(SIZE_FROM_CLASS)) {
    if (className.includes(token)) return px;
  }
  return 48;
}

/** @deprecated Prefer `VybeLogo` from `@/components/brand/VybeLogo` */
export const VybeLogoMark = memo(function VybeLogoMark({
  className,
  animated = true,
  glow = false,
  glowIntensity,
  ...rest
}: VybeLogoMarkProps) {
  const size = inferSize(className);
  return (
    <VybeLogo
      {...rest}
      size={size}
      animated={animated}
      glow={glowIntensity ?? (glow ? 1 : 0.82)}
      className={cn('relative z-10', className)}
    />
  );
});

export default VybeLogoMark;
