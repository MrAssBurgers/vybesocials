import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Lock, Check, Gift, Trophy } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useVybePassTiers, useUserLevel } from '@/hooks/useVybePass';
import { cn } from '@/lib/utils';

interface VybePassSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VybePassSheet({ open, onOpenChange }: VybePassSheetProps) {
  const { data: tiers } = useVybePassTiers();
  const { data: userLevel } = useUserLevel();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const currentLevel = userLevel?.current_level || 1;

  const getRewardTypeIcon = (type: string) => {
    switch (type) {
      case 'badge': return <Trophy className="h-4 w-4" />;
      case 'cosmetic': return <VybeMiniIcon size={16} showSparkles />;
      case 'effect': return <Star className="h-4 w-4" />;
      case 'title': return <Gift className="h-4 w-4" />;
      default: return <Gift className="h-4 w-4" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
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

        <ScrollArea className="h-[calc(100%-80px)]">
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
                    "relative p-4 rounded-xl border transition-all cursor-pointer",
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
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getRewardTypeIcon(tier.reward_type)}
                        <span className="capitalize">{tier.reward_type}</span>
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
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
