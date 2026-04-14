import { memo } from 'react';
import { motion } from 'framer-motion';
import { Zap, Users, Target, Sparkles, Gift, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { VybeDNA } from '@/hooks/useVybeDNA';
import { computeDNAPerks, getDisplayPerks } from '@/lib/dnaPerks';
import { cn } from '@/lib/utils';

interface DNAPerksProps {
  dna: VybeDNA;
}

const ICON_MAP = {
  Zap,
  Users,
  Target,
  Sparkles,
  Gift,
  TrendingUp,
} as const;

export const DNAPerks = memo(function DNAPerks({ dna }: DNAPerksProps) {
  const pv = dna.personality_vector as Record<string, number>;
  const perks = computeDNAPerks(pv);
  const displayPerks = getDisplayPerks(perks);
  const dominantScore = Math.round(perks.dominantScore * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
    >
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              DNA Perks — {perks.archetypeName}
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
              {dominantScore}% dominant
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your {perks.archetypeName} archetype powers these active benefits. Keep using VYBE to strengthen your DNA and unlock stronger perks.
          </p>

          <div className="space-y-2">
            {displayPerks.map((perk, i) => {
              const Icon = ICON_MAP[perk.icon];
              return (
                <motion.div
                  key={perk.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl border border-border/30",
                    perk.active ? "bg-card/50" : "bg-card/20 opacity-60"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    perk.active ? "bg-primary/10" : "bg-muted/10"
                  )}>
                    <Icon className={cn("w-4 h-4", perk.active ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{perk.title}</p>
                    <p className="text-[10px] text-muted-foreground">{perk.description}</p>
                  </div>
                  <span className={cn(
                    "text-[11px] font-bold shrink-0",
                    perk.active ? "text-primary" : "text-muted-foreground"
                  )}>
                    {perk.value}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});
