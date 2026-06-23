import { motion } from 'framer-motion';
import { Shield, RefreshCw, Clock, Car, Accessibility, Info, Sparkles } from 'lucide-react';
import type { MapLocationIntel } from '@/lib/vybemap/types';
import { intelVerdictEmoji, safetyScoreColor } from '@/lib/vybemap/locationIntel';
import { labelMeta } from '@/lib/vybemap/intelLabels';
import { cn } from '@/lib/utils';

interface LocationIntelPanelProps {
  intel: MapLocationIntel | null | undefined;
  loading?: boolean;
  failed?: boolean;
  compact?: boolean;
  onRefresh?: () => void;
  className?: string;
}

export function LocationIntelPanel({
  intel,
  loading,
  failed,
  compact,
  onRefresh,
  className,
}: LocationIntelPanelProps) {
  if (loading) {
    return (
      <div className={cn('rounded-2xl border border-violet-500/20 bg-violet-500/8 p-4', className)}>
        <div className="flex items-center gap-2 text-violet-200">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <p className="text-xs font-semibold">Vybe Intelligence researching this area…</p>
        </div>
        <p className="text-[10px] text-white/35 mt-2">Checking safety, access rules, and local context</p>
      </div>
    );
  }

  if (failed && !intel) {
    return (
      <div className={cn('rounded-2xl border border-white/10 bg-white/5 p-3', className)}>
        <p className="text-xs text-white/50">Area intelligence unavailable — try again later.</p>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="mt-2 text-[10px] font-bold text-violet-300">
            Retry research
          </button>
        )}
      </div>
    );
  }

  if (!intel) return null;

  const verdictBg =
    intel.verdict === 'safe'
      ? 'border-emerald-500/25 bg-emerald-500/10'
      : intel.verdict === 'caution'
        ? 'border-amber-500/25 bg-amber-500/10'
        : 'border-red-500/30 bg-red-500/12';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-2xl border p-4', verdictBg, className)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-violet-300 shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/80">
              Vybe Area Intelligence
            </p>
            <p className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5">
              {intelVerdictEmoji(intel.verdict)}
              <span className="capitalize">{intel.verdict}</span>
              <span className={cn('text-[11px]', safetyScoreColor(intel.safety_score))}>
                · Safety {intel.safety_score}/100
              </span>
            </p>
          </div>
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="h-8 w-8 rounded-lg bg-white/8 flex items-center justify-center text-white/50 hover:text-white"
            aria-label="Refresh area research"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <p className={cn('text-xs text-white/75 leading-relaxed', compact && 'line-clamp-3')}>
        {intel.summary}
      </p>

      {intel.labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {intel.labels.map((l, i) => {
            const meta = labelMeta(l.type);
            return (
              <span
                key={`${l.type}-${i}`}
                title={l.detail}
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full border',
                  meta.bg,
                  meta.color,
                )}
              >
                {meta.emoji} {l.title || meta.short}
              </span>
            );
          })}
        </div>
      )}

      {!compact && intel.labels.some((l) => l.detail) && (
        <div className="mt-3 space-y-1.5">
          {intel.labels.filter((l) => l.severity !== 'info').slice(0, 3).map((l, i) => (
            <p key={i} className="text-[10px] text-white/55 leading-snug">
              <span className="font-semibold text-white/70">{l.title}:</span> {l.detail}
            </p>
          ))}
        </div>
      )}

      {!compact && intel.tips.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/8">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/35 mb-1.5">Helpful tips</p>
          <ul className="space-y-1">
            {intel.tips.slice(0, 4).map((tip, i) => (
              <li key={i} className="text-[11px] text-white/60 flex gap-1.5">
                <span className="text-emerald-400 shrink-0">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && (intel.typical_hours || intel.parking_notes || intel.accessibility_notes) && (
        <div className="mt-3 grid grid-cols-1 gap-1.5 text-[10px] text-white/50">
          {intel.typical_hours && (
            <p className="flex items-start gap-1.5">
              <Clock className="h-3 w-3 shrink-0 mt-0.5" /> {intel.typical_hours}
            </p>
          )}
          {intel.parking_notes && (
            <p className="flex items-start gap-1.5">
              <Car className="h-3 w-3 shrink-0 mt-0.5" /> {intel.parking_notes}
            </p>
          )}
          {intel.accessibility_notes && (
            <p className="flex items-start gap-1.5">
              <Accessibility className="h-3 w-3 shrink-0 mt-0.5" /> {intel.accessibility_notes}
            </p>
          )}
        </div>
      )}

      {intel.sources_note && (
        <p className="mt-2 flex items-start gap-1 text-[9px] text-white/30">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          {intel.sources_note} · Updated {new Date(intel.researched_at).toLocaleDateString()}
        </p>
      )}
    </motion.div>
  );
}

/** Compact inline badge for map markers / route bar. */
export function LocationIntelBadge({
  verdict,
  topLabel,
}: {
  verdict?: 'safe' | 'caution' | 'avoid';
  topLabel?: string;
}) {
  if (!verdict || verdict === 'safe') return null;
  const isAvoid = verdict === 'avoid';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full',
        isAvoid ? 'bg-red-500/90 text-white' : 'bg-amber-500/85 text-black',
      )}
    >
      {isAvoid ? '🚫' : '⚠️'} {topLabel || (isAvoid ? 'Avoid' : 'Caution')}
    </span>
  );
}
