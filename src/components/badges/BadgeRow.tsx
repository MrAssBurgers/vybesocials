import { memo } from 'react';
import { cn } from '@/lib/utils';
import { BadgeIcon } from './BadgeIcon';
import { FounderBadge } from './FounderBadge';

interface Badge {
  id: string;
  icon: string;
  name: string;
  description?: string | null;
  gradient_from?: string | null;
  gradient_to?: string | null;
  effect?: string | null;
  is_animated?: boolean;
}

interface BadgeRowProps {
  badges: Badge[];
  maxVisible?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * BadgeRow - Displays a horizontal row of badges
 * Shows up to maxVisible badges with a +N indicator for overflow
 */
export const BadgeRow = memo(function BadgeRow({
  badges,
  maxVisible = 5,
  size = 'sm',
  className,
}: BadgeRowProps) {
  if (!badges || badges.length === 0) {
    return null;
  }

  const visibleBadges = badges.slice(0, maxVisible);
  const overflowCount = badges.length - maxVisible;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {visibleBadges.map((badge) => (
        badge.name === 'Founder' ? (
          <FounderBadge key={badge.id} size={size === 'xs' ? 'sm' : size} showTooltip />
        ) : (
          <BadgeIcon
            key={badge.id}
            icon={badge.icon}
            name={badge.name}
            description={badge.description}
            gradient_from={badge.gradient_from}
            gradient_to={badge.gradient_to}
            effect={badge.effect}
            is_animated={badge.is_animated}
            size={size}
          />
        )
      ))}
      {overflowCount > 0 && (
        <span className="text-xs text-muted-foreground font-medium px-1">
          +{overflowCount}
        </span>
      )}
    </div>
  );
});
