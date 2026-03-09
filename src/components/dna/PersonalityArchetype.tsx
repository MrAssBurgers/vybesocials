import { motion } from 'framer-motion';
import { Flame, Users, Palette, Zap, Heart, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { VybeDNA } from '@/hooks/useVybeDNA';

interface Archetype {
  name: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
}

const ARCHETYPES: Record<string, Archetype> = {
  trailblazer: {
    name: 'trailblazer',
    title: 'The Trailblazer',
    description: 'You lead the charge. High activity and energy drive everything you do — always first to explore, react, and engage.',
    icon: Flame,
    gradient: 'from-orange-500 to-red-500',
  },
  connector: {
    name: 'connector',
    title: 'The Connector',
    description: 'People gravitate toward you. Your social energy creates bonds and brings communities together effortlessly.',
    icon: Heart,
    gradient: 'from-pink-500 to-rose-500',
  },
  visionary: {
    name: 'visionary',
    title: 'The Visionary',
    description: 'You see what others miss. A creative force that transforms ideas into something unforgettable.',
    icon: Lightbulb,
    gradient: 'from-violet-500 to-purple-500',
  },
  catalyst: {
    name: 'catalyst',
    title: 'The Catalyst',
    description: 'Equal parts energy and empathy. You spark movement in others and amplify every room you enter.',
    icon: Zap,
    gradient: 'from-yellow-500 to-amber-500',
  },
  architect: {
    name: 'architect',
    title: 'The Architect',
    description: 'Strategic and creative — you build systems, aesthetics, and experiences that others want to be part of.',
    icon: Palette,
    gradient: 'from-cyan-500 to-blue-500',
  },
  harmonizer: {
    name: 'harmonizer',
    title: 'The Harmonizer',
    description: 'Balanced across all dimensions. You bring stability and flow wherever you go — a true all-rounder.',
    icon: Users,
    gradient: 'from-emerald-500 to-teal-500',
  },
};

function getArchetype(pv: Record<string, number>): Archetype {
  const a = pv.activity ?? 0;
  const s = pv.social ?? 0;
  const c = pv.creative ?? 0;

  const maxVal = Math.max(a, s, c);
  const minVal = Math.min(a, s, c);
  const range = maxVal - minVal;

  // Balanced
  if (range < 0.15) return ARCHETYPES.harmonizer;

  // Dominant single trait
  if (a === maxVal && a - s > 0.15 && a - c > 0.15) return ARCHETYPES.trailblazer;
  if (s === maxVal && s - a > 0.15 && s - c > 0.15) return ARCHETYPES.connector;
  if (c === maxVal && c - a > 0.15 && c - s > 0.15) return ARCHETYPES.visionary;

  // Dual combos
  if (a >= 0.5 && s >= 0.5) return ARCHETYPES.catalyst;
  if (c >= 0.5 && a >= 0.5) return ARCHETYPES.architect;

  return ARCHETYPES.harmonizer;
}

export function PersonalityArchetype({ dna }: { dna: VybeDNA }) {
  const pv = dna.personality_vector as Record<string, number>;
  const arch = getArchetype(pv);
  const Icon = arch.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className="overflow-hidden border-border/50">
        <CardContent className="p-0">
          {/* Archetype banner */}
          <div className={`bg-gradient-to-r ${arch.gradient} p-4 pb-5`}>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Your Archetype</p>
                <h3 className="text-white text-xl font-bold">{arch.title}</h3>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="p-4 -mt-2 bg-card rounded-t-xl relative">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {arch.description}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
