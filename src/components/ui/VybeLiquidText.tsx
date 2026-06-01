import * as React from 'react';
import { cn } from '@/lib/utils';

type VybeLiquidTextProps<T extends React.ElementType = 'span'> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const BRAND_STREAM = [
  'hsl(var(--vybe-brand-primary)) 0%',
  'hsl(var(--vybe-brand-purple)) 16.666%',
  'hsl(var(--vybe-brand-accent)) 33.333%',
  'hsl(var(--vybe-brand-primary)) 50%',
  'hsl(var(--vybe-brand-purple)) 66.666%',
  'hsl(var(--vybe-brand-accent)) 83.333%',
  'hsl(var(--vybe-brand-primary)) 100%',
].join(', ');

const streamStyle: React.CSSProperties = {
  backgroundImage: `linear-gradient(90deg, ${BRAND_STREAM})`,
  backgroundSize: '200% 100%',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
  animation: 'vybe-liquid-text-roll calc(22s * var(--anim-speed, 1)) linear infinite',
};

const shimmerStyle: React.CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(105deg, transparent 0%, hsl(0 0% 100% / 0.07) 22%, transparent 44%)',
  backgroundSize: '200% 100%',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
  animation: 'vybe-liquid-text-shimmer calc(9s * var(--anim-speed, 1)) linear infinite',
};

/** Two clipped text layers — same stream + shimmer timing as vybe-liquid-button fill. */
export function VybeLiquidText<T extends React.ElementType = 'span'>({
  as,
  className,
  children,
  ...props
}: VybeLiquidTextProps<T>) {
  const Comp = as ?? 'span';

  return (
    <Comp
      className={cn('vybe-liquid-text relative inline-block', className)}
      data-allow-animation="true"
      {...props}
    >
      <span
        className="vybe-liquid-text__shimmer pointer-events-none absolute inset-0 block"
        style={shimmerStyle}
        aria-hidden
      >
        {children}
      </span>
      <span className="vybe-liquid-text__stream relative block" style={streamStyle}>
        {children}
      </span>
    </Comp>
  );
}
