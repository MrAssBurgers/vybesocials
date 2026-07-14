import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProfileViewBadge } from '../types';

interface ProfileBadgesRowProps {
  displayName: string;
  badges: ProfileViewBadge[];
  onSeeAll?: () => void;
  className?: string;
}

const BADGE_GLOWS = [
  'hsl(var(--primary) / 0.35)',
  'hsl(var(--accent) / 0.35)',
  'hsl(45 95% 55% / 0.35)',
  'hsl(142 70% 45% / 0.3)',
  'hsl(280 70% 60% / 0.35)',
  'hsl(var(--primary) / 0.25)',
  'hsl(var(--accent) / 0.25)',
  'hsl(45 95% 55% / 0.25)',
];

export function ProfileBadgesRow({
  displayName,
  badges,
  onSeeAll,
  className,
}: ProfileBadgesRowProps) {
  if (!badges.length) return null;

  const first = displayName.split(' ')[0] || displayName;

  return (
    <section className={cn('vybe-profile-chrome px-4 py-1', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold">{first}&apos;s VYBE Badges</h2>
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          See All
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
        {badges.slice(0, 8).map((b, i) => {
          const icon = b.icon_url;
          const looksLikeUrl = !!icon && /^(https?:|data:|\/)/.test(icon);
          return (
            <button
              key={b.id}
              type="button"
              onClick={onSeeAll}
              title={b.name}
              className="vybe-profile-badge-tile"
              style={{ '--badge-glow': BADGE_GLOWS[i % BADGE_GLOWS.length] } as React.CSSProperties}
            >
              {looksLikeUrl ? (
                <img src={icon!} alt={b.name} className="h-9 w-9 object-contain" />
              ) : (
                <span aria-hidden className="text-2xl">
                  {icon || '🏅'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
