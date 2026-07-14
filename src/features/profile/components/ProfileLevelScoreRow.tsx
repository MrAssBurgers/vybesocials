import { cn } from '@/lib/utils';
import type { ProfileViewLevel, ProfileViewScore } from '../types';

interface ProfileLevelScoreRowProps {
  level?: ProfileViewLevel;
  score?: ProfileViewScore;
  onOpenScore?: () => void;
  className?: string;
}

function formatScore(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function xpProgressPercent(level?: ProfileViewLevel): number {
  if (level?.xpToNext != null && level.xpToNext > 0) {
    return Math.min(92, Math.max(12, 100 - Math.min(level.xpToNext, 100)));
  }
  return 58;
}

export function ProfileLevelScoreRow({
  level,
  score,
  onOpenScore,
  className,
}: ProfileLevelScoreRowProps) {
  if (!score?.visible) return null;

  const progress = xpProgressPercent(level);
  const xpLabel =
    level?.xpToNext != null && level.xpToNext > 0
      ? `${level.xpToNext.toLocaleString()} XP to Lv. ${(level.level ?? 0) + 1}`
      : null;

  return (
    <div className={cn('vybe-profile-chrome px-4', className)}>
      <div className="vybe-profile-level-score-row vybe-profile-glass overflow-hidden rounded-xl">
        <div className="flex divide-x divide-border/40">
          <button
            type="button"
            onClick={onOpenScore}
            className="flex min-w-0 flex-1 flex-col items-start px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              VYBE Level
            </span>
            <span className="mt-0.5 text-lg font-bold tabular-nums leading-none">
              {level?.level ?? '—'}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenScore}
            className="flex min-w-0 flex-1 flex-col items-start px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              VYBE Score
            </span>
            <span className="mt-0.5 text-lg font-bold tabular-nums leading-none">
              {formatScore(score.score)}
            </span>
          </button>
        </div>
        {level?.level != null && (
          <div className="border-t border-border/30 px-3 py-2">
            <div className="h-1 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                style={{ width: `${progress}%` }}
              />
            </div>
            {xpLabel ? (
              <p className="mt-1 text-[10px] text-muted-foreground">{xpLabel}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
