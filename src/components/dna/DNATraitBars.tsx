import { motion } from 'framer-motion';
import { Activity, Users, Brush } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VybeDNA } from '@/hooks/useVybeDNA';

const TRAITS = [
  { key: 'activity', label: 'Activity', icon: Activity, emoji: '⚡' },
  { key: 'social', label: 'Social', icon: Users, emoji: '💬' },
  { key: 'creative', label: 'Creative', icon: Brush, emoji: '🎨' },
] as const;

function getTraitLabel(value: number): string {
  if (value >= 0.9) return 'Legendary';
  if (value >= 0.75) return 'Very High';
  if (value >= 0.55) return 'High';
  if (value >= 0.35) return 'Moderate';
  if (value >= 0.15) return 'Low';
  return 'Dormant';
}

export function DNATraitBars({ dna }: { dna: VybeDNA }) {
  const pv = dna.personality_vector as Record<string, number>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personality Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {TRAITS.map((trait, idx) => {
            const value = pv[trait.key] ?? 0;
            const color = dna.signature_colors[idx];
            const Icon = trait.icon;

            return (
              <div key={trait.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${color}22` }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                    </div>
                    <span className="text-sm font-medium text-foreground">{trait.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{getTraitLabel(value)}</span>
                    <span className="text-sm font-bold" style={{ color }}>{Math.round(value * 100)}%</span>
                  </div>
                </div>
                <div className="h-2.5 bg-muted/60 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                      boxShadow: `0 0 8px ${color}44`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `${value * 100}%` }}
                    transition={{ duration: 1, ease: 'easeOut', delay: 0.3 + idx * 0.15 }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </motion.div>
  );
}
