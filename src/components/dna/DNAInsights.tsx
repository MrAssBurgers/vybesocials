import { motion } from 'framer-motion';
import { TrendingUp, Shield, Eye, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VybeDNA } from '@/hooks/useVybeDNA';

interface Insight {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
}

function getInsights(dna: VybeDNA): Insight[] {
  const pv = dna.personality_vector as Record<string, number>;
  const a = pv.activity ?? 0;
  const s = pv.social ?? 0;
  const c = pv.creative ?? 0;
  const avg = (a + s + c) / 3;

  const rarity = avg >= 0.8 ? 'Legendary' : avg >= 0.6 ? 'Rare' : avg >= 0.4 ? 'Uncommon' : 'Common';
  const compatibility = s >= 0.6 ? 'Connectors & Catalysts' : c >= 0.6 ? 'Visionaries & Architects' : 'Trailblazers & Harmonizers';
  const strength = a >= s && a >= c ? 'Drive & Persistence' : s >= a && s >= c ? 'Empathy & Influence' : 'Innovation & Vision';

  return [
    { icon: Shield, label: 'DNA Rarity', value: rarity, detail: `Top ${Math.max(1, Math.round((1 - avg) * 100))}% of users` },
    { icon: TrendingUp, label: 'Core Strength', value: strength, detail: 'Your dominant superpower' },
    { icon: Eye, label: 'Best Match', value: compatibility, detail: 'Archetypes you vibe with most' },
    { icon: Sparkles, label: 'Aura Power', value: `${Math.round(dna.aura_intensity * 100)}%`, detail: 'Overall energy signature' },
  ];
}

export function DNAInsights({ dna }: { dna: VybeDNA }) {
  const insights = getInsights(dna);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">DNA Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {insights.map((insight, idx) => {
              const Icon = insight.icon;
              return (
                <motion.div
                  key={insight.label}
                  className="p-3 rounded-xl bg-secondary/40 space-y-1.5"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + idx * 0.1 }}
                >
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{insight.label}</span>
                  </div>
                  <p className="text-sm font-bold text-foreground leading-tight">{insight.value}</p>
                  <p className="text-[10px] text-muted-foreground">{insight.detail}</p>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
