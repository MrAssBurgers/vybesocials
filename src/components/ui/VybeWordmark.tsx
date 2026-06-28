import { memo } from 'react';
import { cn } from '@/lib/utils';

export type VybeWordmarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'splash';

const FONT_SIZE_PX: Record<VybeWordmarkSize, number> = {
  xs: 15,
  sm: 21,
  md: 27,
  lg: 34,
  xl: 42,
  splash: 60,
};

interface VybeWordmarkProps {
  className?: string;
  size?: VybeWordmarkSize;
  as?: 'span' | 'h1' | 'h2' | 'p';
}

/**
 * Brush VYBE wordmark — live text tinted with the user's primary/accent theme.
 * PNG masks were clipped at export; text + brush font preserves full descenders.
 */
export const VybeWordmark = memo(function VybeWordmark({
  className,
  size = 'md',
  as: Tag = 'span',
}: VybeWordmarkProps) {
  const fontSize = FONT_SIZE_PX[size];

  return (
    <Tag
      className={cn('vybe-wordmark inline-block max-w-full shrink-0 overflow-visible', className)}
      aria-label="VYBE"
    >
      <span className="vybe-wordmark-text" style={{ fontSize }} aria-hidden="true">
        VYBE
      </span>
    </Tag>
  );
});

export default VybeWordmark;
