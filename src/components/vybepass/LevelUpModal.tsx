import { motion } from 'framer-motion';
import { ArrowUp, Crown, Sparkles, Star, Palette, Type, Gem, Image, Backpack, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface LevelUpReward {
  level: number;
  reward_type: string;
  reward_id: string | null;
  reward_name: string;
  reward_icon: string;
  is_premium?: boolean;
}

interface LevelUpModalProps {
  open: boolean;
  onClose: () => void;
  onGoToLocker?: () => void;
  onEquipReward?: (reward: LevelUpReward) => void;
  oldLevel: number;
  newLevel: number;
  rewards: LevelUpReward[];
}

const REWARD_TYPE_META: Record<string, { label: string; icon: typeof Star; color: string }> = {
  title: { label: 'Title', icon: Type, color: 'text-yellow-400' },
  name_color: { label: 'Name Color', icon: Palette, color: 'text-blue-400' },
  cosmetic: { label: 'Cosmetic', icon: Gem, color: 'text-purple-400' },
  effect: { label: 'Effect', icon: Sparkles, color: 'text-pink-400' },
  profile_theme: { label: 'Profile Theme', icon: Image, color: 'text-emerald-400' },
};

export function LevelUpModal({ open, onClose, onGoToLocker, onEquipReward, oldLevel, newLevel, rewards }: LevelUpModalProps) {
  // Filter out premium items
  const freeRewards = rewards.filter(r => !r.is_premium);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0 border-primary/30">
        <DialogTitle className="sr-only">Level Up</DialogTitle>
        {/* Hero section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative bg-gradient-to-b from-primary/20 via-primary/10 to-transparent pt-8 pb-6 px-6 text-center"
        >
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-primary/40"
              style={{ left: `${15 + i * 14}%`, top: `${20 + (i % 3) * 20}%` }}
              animate={{
                y: [-10, -30, -10],
                opacity: [0.3, 0.8, 0.3],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{ duration: 2 + i * 0.3, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}

          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 10, stiffness: 100 }}
            className="mx-auto mb-3 h-20 w-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-lg shadow-primary/30"
          >
            <ArrowUp className="h-10 w-10 text-primary-foreground" />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-2xl font-bold"
          >
            Level Up!
          </motion.h2>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-2 flex items-center justify-center gap-3"
          >
            <span className="text-lg text-muted-foreground">Lv.{oldLevel}</span>
            <Crown className="h-5 w-5 text-primary" />
            <span className="text-2xl font-bold text-primary">Lv.{newLevel}</span>
          </motion.div>
        </motion.div>

        {/* Unlocked rewards */}
        <div className="px-6 pb-6 space-y-3">
          {freeRewards.length > 0 && (
            <>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm font-medium text-muted-foreground text-center"
              >
                You unlocked {freeRewards.length} new {freeRewards.length === 1 ? 'reward' : 'rewards'}!
              </motion.p>

              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2 pr-2">
                  {freeRewards.map((reward, i) => {
                    const meta = REWARD_TYPE_META[reward.reward_type] || { label: reward.reward_type, icon: Star, color: 'text-primary' };
                    const Icon = meta.icon;
                    
                    return (
                      <motion.div
                        key={`${reward.level}-${reward.reward_name}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl",
                          "bg-gradient-to-r from-secondary/80 to-secondary/40",
                          "border border-border/50"
                        )}
                      >
                        <div className="text-2xl flex-shrink-0">{reward.reward_icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{reward.reward_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Icon className={cn("h-3 w-3", meta.color)} />
                            <span className="text-xs text-muted-foreground">{meta.label} • Level {reward.level}</span>
                          </div>
                        </div>
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.7 + i * 0.1, type: 'spring' }}
                          className="px-2 py-0.5 rounded-full bg-primary/15 border border-primary/30"
                        >
                          <span className="text-[10px] font-bold text-primary uppercase">New</span>
                        </motion.div>
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}

          {/* 3 Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 + freeRewards.length * 0.1 }}
            className="space-y-2 pt-1"
          >
            {freeRewards.length > 0 && onEquipReward && (
              <Button
                onClick={() => {
                  onEquipReward(freeRewards[0]);
                  onClose();
                }}
                className="w-full"
                size="lg"
              >
                <Check className="h-4 w-4 mr-2" />
                Equip {freeRewards[0].reward_name}
              </Button>
            )}

            <div className="flex gap-2">
              {onGoToLocker && (
                <Button
                  onClick={() => {
                    onClose();
                    onGoToLocker();
                  }}
                  variant="secondary"
                  className="flex-1"
                  size="lg"
                >
                  <Backpack className="h-4 w-4 mr-2" />
                  Locker
                </Button>
              )}
              <Button
                onClick={onClose}
                variant="outline"
                className={cn("flex-1", !onGoToLocker && "w-full")}
                size="lg"
              >
                Close
              </Button>
            </div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
