import { memo } from 'react';
import { motion } from 'framer-motion';
import { Zap, Users, Target, Sparkles, Gift, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { VybeDNA } from '@/hooks/useVybeDNA';

interface DNAPerksProps {
  dna: VybeDNA;
}

const ARCHETYPE_PERKS: Record<string, { name: string; perks: { icon: typeof Zap; title: string; description: string; value: string }[] }> = {
  activity: {
    name: 'Power User',
    perks: [
      { icon: Zap, title: 'XP Surge', description: 'Bonus XP from daily activities', value: '+15%' },
      { icon: Target, title: 'Challenge Priority', description: 'Early access to new challenges', value: 'Active' },
      { icon: TrendingUp, title: 'Streak Shield', description: 'Extended streak grace period', value: '+2hrs' },
    ],
  },
  social: {
    name: 'Connector',
    perks: [
      { icon: Users, title: 'Social Boost', description: 'Higher visibility in friend suggestions', value: '+20%' },
      { icon: Gift, title: 'Gift Bonus', description: 'Extra tokens when gifting friends', value: '+10%' },
      { icon: Sparkles, title: 'Reaction Power', description: 'Reactions give extra XP to creators', value: '+5 XP' },
    ],
  },
  creative: {
    name: 'Creator',
    perks: [
      { icon: Sparkles, title: 'Creator Spotlight', description: 'Posts boosted in discovery feed', value: '+25%' },
      { icon: TrendingUp, title: 'Token Multiplier', description: 'Earn more tokens from content', value: '+15%' },
      { icon: Gift, title: 'Exclusive Cosmetics', description: 'Access to creator-only items', value: 'Unlocked' },
    ],
  },
};

function getDominantTrait(pv: Record<string, number>): string {
  const traits = { activity: pv.activity ?? 0, social: pv.social ?? 0, creative: pv.creative ?? 0 };
  return Object.entries(traits).sort(([, a], [, b]) => b - a)[0][0];
}

export const DNAPerks = memo(function DNAPerks({ dna }: DNAPerksProps) {
  const pv = dna.personality_vector as Record<string, number>;
  const dominant = getDominantTrait(pv);
  const archetypeData = ARCHETYPE_PERKS[dominant] || ARCHETYPE_PERKS.activity;
  const dominantScore = Math.round((pv[dominant] ?? 0) * 100);

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
              DNA Perks — {archetypeData.name}
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
              {dominantScore}% dominant
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Your {archetypeData.name} archetype unlocks these active benefits. Keep evolving your DNA to strengthen perks.
          </p>

          <div className="space-y-2">
            {archetypeData.perks.map((perk, i) => {
              const Icon = perk.icon;
              return (
                <motion.div
                  key={perk.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-card/50 border border-border/30"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{perk.title}</p>
                    <p className="text-[10px] text-muted-foreground">{perk.description}</p>
                  </div>
                  <span className="text-[11px] font-bold text-primary shrink-0">{perk.value}</span>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});
