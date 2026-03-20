import { motion, AnimatePresence } from 'framer-motion';
import { Flame, X, Trophy, Crown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StreakPopupProps {
  open: boolean;
  streak: number;
  longestStreak: number;
  isNewStreak?: boolean;
  onClose: () => void;
  isPremium?: boolean;
  onRestore?: () => void;
  isRestoring?: boolean;
}

export function StreakPopup({ open, streak, longestStreak, isNewStreak, onClose, isPremium, onRestore, isRestoring }: StreakPopupProps) {
  const isNewRecord = streak === longestStreak && streak > 1;
  const streakBroken = isNewStreak && longestStreak > 1;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm bg-gradient-to-br from-accent/20 via-background to-destructive/20 border border-accent/30 rounded-3xl p-6 shadow-2xl"
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-3 right-3 h-8 w-8 rounded-full hover:bg-foreground/10"
            >
              <X className="h-4 w-4" />
            </Button>

            {/* Fire animation */}
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', damping: 10, stiffness: 200 }}
                className="relative"
              >
                <motion.div
                  animate={{ 
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: 1.5,
                    ease: 'easeInOut',
                  }}
                  className="text-7xl mb-4"
                >
                  🔥
                </motion.div>
                
                {/* Streak count badge */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', damping: 15 }}
                  className="absolute -bottom-2 -right-2 h-10 w-10 bg-gradient-to-br from-accent to-destructive rounded-full flex items-center justify-center text-accent-foreground font-bold shadow-lg"
                >
                  {streak}
                </motion.div>
              </motion.div>

              {/* Title */}
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-2xl font-bold mt-4 bg-gradient-to-r from-accent via-primary to-accent bg-clip-text text-transparent"
              >
                {isNewStreak ? 'New Streak Started!' : `${streak} Day Streak!`}
              </motion.h2>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-muted-foreground mt-2"
              >
                {isNewStreak 
                  ? 'Come back tomorrow to keep it going!'
                  : streak > 1 
                    ? "You're on fire! Keep the momentum going!" 
                    : 'Welcome back! Start building your streak.'}
              </motion.p>

              {/* Streak restore for premium users when streak broke */}
              {streakBroken && isPremium && onRestore && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.35 }}
                  className="mt-4 w-full"
                >
                  <Button
                    onClick={onRestore}
                    disabled={isRestoring}
                    variant="outline"
                    className="w-full gap-2 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500"
                  >
                    <Crown className="h-4 w-4" />
                    {isRestoring ? 'Restoring...' : `Restore ${longestStreak}-Day Streak`}
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-1">VYBE Pro perk</p>
                </motion.div>
              )}

              {/* New record badge */}
              {isNewRecord && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center gap-2 mt-4 px-4 py-2 bg-primary/20 border border-primary/30 rounded-full"
                >
                  <Trophy className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-primary">New Personal Record!</span>
                </motion.div>
              )}

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="flex gap-6 mt-6"
              >
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{streak}</div>
                  <div className="text-xs text-muted-foreground">Current</div>
                </div>
                <div className="w-px bg-border" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{longestStreak}</div>
                  <div className="text-xs text-muted-foreground">Best</div>
                </div>
              </motion.div>

              {/* Close button */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="mt-6 w-full"
              >
                <Button 
                  onClick={onClose}
                  className="w-full bg-gradient-to-r from-accent to-destructive hover:opacity-90"
                >
                  <Flame className="h-4 w-4 mr-2" />
                  Keep It Burning!
                </Button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}