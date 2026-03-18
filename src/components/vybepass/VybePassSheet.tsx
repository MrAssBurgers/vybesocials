import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Lock, Check, Gift, Trophy, Palette, Layers, Diamond, Wand2, Type } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useVybePassTiers, useUserLevel } from '@/hooks/useVybePass';
import { cn } from '@/lib/utils';

// ── Preview maps (shared with locker) ───────────────────────────
const NAME_COLOR_MAP: Record<string, string> = {
  'Crimson': '#DC2626', 'Ocean Blue': '#2563EB', 'Emerald': '#059669',
  'Sunset Orange': '#EA580C', 'Neon Pink': '#EC4899', 'Ice Blue': '#06B6D4',
  'Royal Purple': '#7C3AED', 'Toxic Green': '#84CC16', 'Gold': '#EAB308',
  'Diamond White': '#E2E8F0',
  'Holographic': 'linear-gradient(90deg, #EC4899, #8B5CF6, #06B6D4, #10B981, #EAB308)',
};

const THEME_PREVIEW: Record<string, { from: string; to: string }> = {
  'Midnight': { from: '#1e1b4b', to: '#312e81' },
  'Sunset Vibes': { from: '#9a3412', to: '#dc2626' },
  'Arctic': { from: '#164e63', to: '#0e7490' },
  'Neon City': { from: '#701a75', to: '#be185d' },
  'Inferno': { from: '#7c2d12', to: '#dc2626' },
  'Galaxy': { from: '#1e1b4b', to: '#6d28d9' },
  'Aurora Borealis': { from: '#064e3b', to: '#6d28d9' },
  'Void': { from: '#0a0a0a', to: '#1c1917' },
};

const FRAME_COLORS: Record<string, string> = {
  'Blue Glow': '#60A5FA', 'Fire Ring': '#F97316', 'Diamond Frame': '#67E8F9',
  'Neon Ring': '#EC4899', 'Emerald Ring': '#34D399', 'Sunset Halo': '#FBBF24',
  'Lightning Frame': '#FDE047', 'Obsidian Frame': '#52525B', 'Holographic Frame': '#A78BFA',
};

const EFFECT_CLASS_MAP: Record<string, string> = {
  'Sparkle': 'sparkle-name', 'Rainbow Shift': 'rainbow-name', 'Fire Trail': 'fire-glow',
  'Cosmic Glow': 'cosmic-name', 'Glitch': 'glitch-name', 'Neon Pulse': 'neon-pulse-name',
  'Shadow Flicker': 'shadow-flicker-name', 'Aurora Wave': 'aurora-wave-name',
  'Electric Surge': 'electric-surge-name', 'Plasma Storm': 'plasma-storm-name',
};

interface VybePassSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Reward preview component ────────────────────────────────────
function RewardPreview({ type, name }: { type: string; name: string }) {
  if (type === 'name_color') {
    const color = NAME_COLOR_MAP[name];
    if (!color) return null;
    const isGrad = color.startsWith('linear');
    return (
      <div
        className="w-6 h-6 rounded-full border border-background shadow-sm shrink-0"
        style={{ background: isGrad ? color : color }}
      />
    );
  }

  if (type === 'profile_theme') {
    const preview = THEME_PREVIEW[name];
    if (!preview) return null;
    return (
      <div
        className="w-10 h-6 rounded-lg shrink-0 overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${preview.from}, ${preview.to})` }}
      />
    );
  }

  if (type === 'cosmetic') {
    const frameColor = FRAME_COLORS[name];
    if (!frameColor) return null;
    return (
      <div
        className="w-7 h-7 rounded-full shrink-0"
        style={{ boxShadow: `0 0 6px ${frameColor}, inset 0 0 0 2px ${frameColor}` }}
      />
    );
  }

  if (type === 'effect') {
    const cls = EFFECT_CLASS_MAP[name];
    return (
      <span className={cn("text-[10px] font-bold text-foreground shrink-0", cls)}>
        Abc
      </span>
    );
  }

  return null;
}

export function VybePassSheet({ open, onOpenChange }: VybePassSheetProps) {
  const { data: tiers } = useVybePassTiers();
  const { data: userLevel } = useUserLevel();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const currentLevel = userLevel?.current_level || 1;

  const getRewardTypeIcon = (type: string) => {
    switch (type) {
      case 'name_color': return <Palette className="h-4 w-4" />;
      case 'profile_theme': return <Layers className="h-4 w-4" />;
      case 'cosmetic': return <Diamond className="h-4 w-4" />;
      case 'effect': return <Wand2 className="h-4 w-4" />;
      case 'title': return <Type className="h-4 w-4" />;
      case 'badge': return <Trophy className="h-4 w-4" />;
      default: return <Gift className="h-4 w-4" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl overflow-hidden">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
              <Trophy className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <span>VYBE Pass</span>
              <p className="text-sm font-normal text-muted-foreground">
                Level {currentLevel} • {userLevel?.total_xp || 0} XP
              </p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="h-[calc(100%-80px)] overflow-y-auto overscroll-contain touch-pan-y -mx-1 px-1">
          <div className="space-y-2 pb-6">
            {tiers?.map((tier, idx) => {
              const isUnlocked = currentLevel >= tier.level;
              const isCurrent = currentLevel === tier.level;
              const isSelected = selectedTier === tier.id;

              return (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => setSelectedTier(isSelected ? null : tier.id)}
                  className={cn(
                    "relative p-4 rounded-xl border transition-all cursor-pointer backdrop-blur-md",
                    isUnlocked 
                      ? "bg-primary/5 border-primary/30" 
                      : "bg-secondary/30 border-border/50",
                    isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    tier.is_premium && "border-purple-500/50",
                    isSelected && "bg-primary/10"
                  )}
                >
                  <div className="flex items-center gap-4">
                    {/* Level indicator */}
                    <div className={cn(
                      "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                      isUnlocked 
                        ? "bg-gradient-to-br from-primary/20 to-accent/20" 
                        : "bg-secondary"
                    )}>
                      {isUnlocked ? (
                        <Check className="h-6 w-6 text-primary" />
                      ) : (
                        <span className="text-lg font-bold text-muted-foreground">
                          {tier.level}
                        </span>
                      )}
                    </div>

                    {/* Reward info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">{tier.reward_icon}</span>
                        <h4 className={cn(
                          "font-semibold truncate",
                          !isUnlocked && "text-muted-foreground"
                        )}>
                          {tier.reward_name}
                        </h4>
                        {/* Inline preview */}
                        <RewardPreview type={tier.reward_type} name={tier.reward_name} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getRewardTypeIcon(tier.reward_type)}
                        <span className="capitalize">{tier.reward_type.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>{tier.xp_required.toLocaleString()} XP</span>
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className="shrink-0">
                      {tier.is_premium && (
                        <Badge variant="secondary" className="bg-purple-500/20 text-purple-400 mb-1">
                          Premium
                        </Badge>
                      )}
                      {isUnlocked ? (
                        <Badge className="bg-primary/20 text-primary">
                          Unlocked
                        </Badge>
                      ) : (
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded description */}
                  <AnimatePresence>
                    {isSelected && tier.reward_description && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <p className="mt-3 pt-3 border-t border-border/50 text-sm text-muted-foreground">
                          {tier.reward_description}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Current level indicator */}
                  {isCurrent && (
                    <motion.div
                      className="absolute -left-1 top-1/2 -translate-y-1/2 h-4 w-1 rounded-full bg-primary"
                      layoutId="current-level"
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
