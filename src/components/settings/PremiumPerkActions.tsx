import { motion } from 'framer-motion';
import {
  Crown, Zap, Check, X, Shield, Eye, Lock, Clock,
  Gift, Sparkles, Palette, Wand2, Phone, Flame,
  Coins, Package, Box,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { UpgradeButton } from '@/components/premium/UpgradeButton';

interface PerkRow {
  icon: React.ElementType;
  label: string;
  free: string | boolean;
  pro: string | boolean;
  color: string;
  comingSoon?: boolean;
}

// Only perks that are ACTUALLY implemented and gated by isPremium in the codebase.
const COMPARISON: PerkRow[] = [
  { icon: Shield, label: 'Ad-free', free: false, pro: true, color: 'from-blue-500 to-indigo-500' },
  { icon: Clock, label: 'Schedule DMs', free: false, pro: true, color: 'from-cyan-500 to-blue-500' },
  { icon: Phone, label: 'Stay-on calls', free: false, pro: true, color: 'from-emerald-500 to-teal-500' },
  { icon: Sparkles, label: 'AR Pro filters', free: 'Limited', pro: 'All', color: 'from-pink-500 to-fuchsia-500' },
  { icon: Box, label: 'Toybox FX', free: 'Basic', pro: 'All', color: 'from-amber-500 to-orange-500' },
  { icon: Flame, label: 'Meme-Ban powers', free: false, pro: true, color: 'from-red-500 to-rose-500' },
  { icon: Package, label: 'Locker exclusives', free: false, pro: true, color: 'from-yellow-500 to-amber-500' },
  { icon: Coins, label: 'Pro marketplace', free: false, pro: true, color: 'from-lime-500 to-green-500' },
  { icon: Palette, label: 'AI themes', free: '1 / day', pro: 'Unlimited', color: 'from-violet-500 to-purple-500' },
  { icon: Gift, label: 'Gift Pro to friends', free: false, pro: true, color: 'from-rose-500 to-pink-500' },
  { icon: Wand2, label: 'AI Humanizer', free: false, pro: 'Soon', color: 'from-indigo-500 to-violet-500', comingSoon: true },
];

export function PremiumPerkActions() {
  const { isPremium } = usePremiumStatus();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Free vs Pro</h3>
            <p className="text-[10px] text-muted-foreground">
              {isPremium ? 'All features unlocked' : 'See what you\'re missing'}
            </p>
          </div>
        </div>
        {isPremium && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold flex items-center gap-1">
            <Check className="h-3 w-3" />
            Active
          </span>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-5 pb-2">
        <div className="w-9 shrink-0" />
        <div className="flex-1 min-w-0" />
        <div className="flex gap-2 shrink-0">
          <span className="text-[9px] font-bold text-muted-foreground uppercase w-16 text-center">Free</span>
          <span className="text-[9px] font-bold text-primary uppercase w-16 text-center">Pro</span>
        </div>
      </div>

      {/* Rows */}
      <div className="px-2 pb-2">
        {COMPARISON.map((row, i) => {
          const Icon = row.icon;
          return (
            <motion.div
              key={row.label}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors hover:bg-muted/40"
            >
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br", row.color)}>
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">
                  {row.label}
                  {row.comingSoon && (
                    <span className="ml-1.5 text-[8px] uppercase font-bold text-primary/80">Soon</span>
                  )}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                <span className="w-16 text-center flex items-center justify-center">
                  {row.free === false ? (
                    <X className="h-3 w-3 text-destructive/50" />
                  ) : row.free === true ? (
                    <Check className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60">{row.free}</span>
                  )}
                </span>
                <span className="w-16 text-center flex items-center justify-center">
                  {row.pro === true ? (
                    <Check className="h-3 w-3 text-primary" />
                  ) : row.pro === false ? (
                    <X className="h-3 w-3 text-destructive/50" />
                  ) : (
                    <span className="text-[10px] text-primary font-medium">{row.pro}</span>
                  )}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Upgrade CTA */}
      {!isPremium && (
        <div className="p-4 pt-2 border-t border-border/50">
          <UpgradeButton
            label="Get VYBE Pro"
            className="w-full h-11 font-bold gap-2"
          />
        </div>
      )}
    </motion.div>
  );
}
