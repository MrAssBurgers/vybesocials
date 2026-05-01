import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Coins, Shield, TrendingUp, Dices, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useActiveBoosts, type BoostType } from '@/hooks/useActiveBoosts';
import { cn } from '@/lib/utils';

const BOOST_META: Record<BoostType, { label: string; icon: any; color: string }> = {
  xp_2x:          { label: '2× XP',                icon: Zap,        color: 'text-amber-400' },
  tokens_2x:      { label: '2× Tokens',            icon: Coins,      color: 'text-emerald-400' },
  visibility:     { label: 'Visibility Boost',     icon: TrendingUp, color: 'text-cyan-400' },
  streak_shield:  { label: 'Streak Shield',        icon: Shield,     color: 'text-violet-400' },
  roulette_spins: { label: 'Roulette Spins',       icon: Dices,      color: 'text-pink-400' },
};

function formatRemaining(expiresAt: string | null, uses: number | null) {
  if (uses != null && expiresAt == null) return `${uses} use${uses === 1 ? '' : 's'} left`;
  if (!expiresAt) return 'Active';
  const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function ActiveBoostsBanner() {
  const { data: boosts = [] } = useActiveBoosts();
  const [, force] = useState(0);

  // Tick once per second so timers count down
  useEffect(() => {
    if (boosts.length === 0) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [boosts.length]);

  if (boosts.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2"
      >
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <Zap className="h-3.5 w-3.5" />
          Active Perks
        </div>
        <div className="flex flex-wrap gap-2">
          {boosts.map((b) => {
            const meta = BOOST_META[b.boost_type];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div
                key={b.id}
                className="flex items-center gap-1.5 rounded-full bg-card border border-border/50 px-2.5 py-1 text-[11px]"
              >
                <Icon className={cn('h-3 w-3', meta.color)} />
                <span className="font-semibold">{meta.label}</span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {formatRemaining(b.expires_at, b.uses_remaining)}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
