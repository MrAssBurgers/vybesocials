import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Sparkles, Zap, Shield, Star, Flame, Palette, MessageSquare, Upload, Eye, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PremiumActivationAnimationProps {
  open: boolean;
  onComplete: () => void;
}

const PREMIUM_PERKS = [
  { icon: Flame, label: 'Meme Ban Powers', color: 'text-red-400' },
  { icon: Sparkles, label: 'Animated Borders', color: 'text-purple-400' },
  { icon: Palette, label: 'Unlimited AI Themes', color: 'text-cyan-400' },
  { icon: MessageSquare, label: 'Scheduled Messages', color: 'text-green-400' },
  { icon: Upload, label: '50MB Uploads', color: 'text-blue-400' },
  { icon: Eye, label: 'Profile Visitors', color: 'text-amber-400' },
  { icon: Shield, label: 'Premium Badge', color: 'text-primary' },
  { icon: Star, label: 'Priority in Explore', color: 'text-yellow-400' },
];

export function PremiumActivationAnimation({ open, onComplete }: PremiumActivationAnimationProps) {
  const [phase, setPhase] = useState<'activating' | 'perks' | 'done'>('activating');

  useEffect(() => {
    if (!open) { setPhase('activating'); return; }
    const t1 = setTimeout(() => setPhase('perks'), 2200);
    const t2 = setTimeout(() => setPhase('done'), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />

        {/* Animated grid background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `linear-gradient(hsl(var(--primary) / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.3) 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />
          {/* Radial glow */}
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
            style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-sm w-full">
          {/* Phase 1: Activating */}
          {phase === 'activating' && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center"
            >
              {/* Crown with ring animation */}
              <div className="relative mb-6">
                <motion.div
                  className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 flex items-center justify-center border border-primary/30"
                  animate={{ rotateY: [0, 360] }}
                  transition={{ duration: 2, ease: 'easeInOut' }}
                >
                  <Crown className="h-14 w-14 text-primary" />
                </motion.div>
                {/* Orbiting particles */}
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-primary"
                    style={{ top: '50%', left: '50%' }}
                    animate={{
                      x: [0, Math.cos(i * 60 * (Math.PI / 180)) * 70],
                      y: [0, Math.sin(i * 60 * (Math.PI / 180)) * 70],
                      scale: [0, 1.2, 0],
                      opacity: [0, 1, 0],
                    }}
                    transition={{ duration: 1.5, delay: 0.3 + i * 0.15, ease: 'easeOut' }}
                  />
                ))}
                {/* Expanding ring */}
                <motion.div
                  className="absolute inset-0 rounded-3xl border-2 border-primary"
                  animate={{ scale: [1, 2.5], opacity: [0.8, 0] }}
                  transition={{ duration: 1.5, delay: 0.5 }}
                />
                <motion.div
                  className="absolute inset-0 rounded-3xl border-2 border-primary"
                  animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1.5, delay: 0.8 }}
                />
              </div>

              <motion.h2
                className="text-2xl font-black tracking-tight"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                Activating Premium
              </motion.h2>
              <motion.div
                className="flex items-center gap-2 mt-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <Zap className="h-4 w-4 text-primary animate-pulse" />
                <span className="text-sm text-muted-foreground">Initializing your perks...</span>
              </motion.div>

              {/* Loading bar */}
              <motion.div
                className="w-48 h-1 rounded-full bg-muted mt-6 overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-primary"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.8, delay: 0.6, ease: 'easeInOut' }}
                />
              </motion.div>
            </motion.div>
          )}

          {/* Phase 2: Perks reveal */}
          {phase === 'perks' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center w-full"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="mb-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/15 flex items-center justify-center border border-primary/20">
                  <Crown className="h-8 w-8 text-primary" />
                </div>
              </motion.div>

              <motion.h2
                className="text-xl font-black mb-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                You're Premium! 👑
              </motion.h2>
              <motion.p
                className="text-sm text-muted-foreground mb-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                Here's what you just unlocked
              </motion.p>

              <div className="grid grid-cols-2 gap-2 w-full">
                {PREMIUM_PERKS.map((perk, i) => (
                  <motion.div
                    key={perk.label}
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary/30 border border-border/40"
                  >
                    <perk.icon className={`h-4 w-4 shrink-0 ${perk.color}`} />
                    <span className="text-[11px] font-medium truncate">{perk.label}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Phase 3: Done */}
          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center"
            >
              <motion.div
                className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-5"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              >
                <Check className="h-10 w-10 text-primary" />
              </motion.div>

              <h2 className="text-2xl font-black mb-2">All Set! 🎉</h2>
              <p className="text-sm text-muted-foreground mb-6">Your premium perks are now active everywhere.</p>

              <Button
                size="lg"
                className="w-full h-12 text-base font-bold gap-2"
                onClick={onComplete}
              >
                <Sparkles className="h-4 w-4" />
                Let's Go!
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
