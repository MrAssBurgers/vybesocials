import { memo } from 'react';
import { cn } from '@/lib/utils';

interface VybeWordmarkProps {
  className?: string;
  /** sm = inbox header, md = default, lg = hero */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  as?: 'span' | 'h1' | 'h2' | 'p';
}

const sizeClasses = {
  sm: 'text-[1.35rem]',
  md: 'text-2xl',
  lg: 'text-3xl',
  xl: 'text-4xl sm:text-5xl',
};

/**
 * Brush-script neon VYBE wordmark matching brand reference art.
 */
export const VybeWordmark = memo(function VybeWordmark({
  className,
  size = 'md',
  as: Tag = 'span',
}: VybeWordmarkProps) {
  return (
    <Tag className={cn('vybe-wordmark', sizeClasses[size], className)} aria-label="VYBE">
      VYBE
    </Tag>
  );
});

export default VybeWordmark;
