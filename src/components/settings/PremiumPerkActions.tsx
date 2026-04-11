import { motion } from 'framer-motion';
import {
  Crown, Laugh, Mic, Flame, Clock, Sparkles,
  Upload, MessageSquare, Palette, Shield, Lock, Check,
  Zap, Star, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { UpgradeButton } from '@/components/premium/UpgradeButton';

interface PerkItem {
  id: string;
  icon: React.ElementType;
  label: string;
  free: string;
  premium: string;
  color: string;
}

const PREMIUM_PERKS: PerkItem[] = [
  {
    id: 'meme-ban',
    icon: Laugh,
    label: 'Meme Ban Powers',
    free: 'Not available',
    premium: 'Ban users with custom memes (5 min)',
    color: 'from-amber-500 to-orange-600',
  },
  {
    id: 'voice',
    icon: Mic,
    label: 'Voice Messages',
    free: 'Not available',
    premium: 'Record & send voice messages in DMs',
    color: 'from-red-500 to-rose-600',
  },
  {
    id: 'vanish',
    icon: Flame,
    label: 'Vanish Mode',
    free: 'Not available',
    premium: 'Self-destructing messages',
    color: 'from-pink-500 to-fuchsia-600',
  },
  {
    id: 'schedule',
    icon: Clock,
    label: 'Scheduled Messages',
    free: 'Not available',
    premium: 'Schedule messages to send later',
    color: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'effects',
    icon: Sparkles,
    label: 'Message Effects',
    free: 'Basic reactions only',
    premium: 'Animations & visual effects',
    color: 'from-yellow-500 to-amber-600',
  },
  {
    id: 'uploads',
    icon: Upload,
    label: 'File Uploads',
    free: '10MB max',
    premium: '50MB + high-res media',
    color: 'from-emerald-500 to-green-600',
  },
  {
    id: 'cosmetics',
    icon: Palette,
    label: 'Cosmetics',
    free: 'Default themes only',
    premium: 'Exclusive colors, frames & effects',
    color: 'from-purple-500 to-violet-600',
  },
  {
    id: 'read-receipts',
    icon: MessageSquare,
    label: 'Read Receipts',
    free: 'Always visible',
    premium: 'Hide when you read messages',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'secret-chats',
    icon: Shield,
    label: 'Secret Chats',
    free: 'Not available',
    premium: 'E2E encrypted conversations',
    color: 'from-slate-500 to-zinc-600',
  },
  {
    id: 'reactions',
    icon: Star,
    label: 'Exclusive Reactions',
    free: 'Standard emojis',
    premium: 'Premium-only reactions & animations',
    color: 'from-orange-500 to-red-600',
  },
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
            <h3 className="font-semibold text-sm">Free vs Premium</h3>
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
          <span className="text-[9px] font-bold text-muted-foreground uppercase w-20 text-center">Free</span>
          <span className="text-[9px] font-bold text-primary uppercase w-20 text-center">Premium</span>
        </div>
      </div>

      {/* Perks comparison */}
      <div className="px-2 pb-2">
        {PREMIUM_PERKS.map((perk, i) => {
          const Icon = perk.icon;
          return (
            <motion.div
              key={perk.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors hover:bg-muted/40"
            >
              <div className={cn(
                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br",
                perk.color,
              )}>
                <Icon className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">{perk.label}</span>
              </div>
              <div className="flex gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground/60 w-20 text-center flex items-center justify-center gap-1">
                  {perk.free === 'Not available' ? (
                    <X className="h-3 w-3 text-destructive/50" />
                  ) : perk.free}
                </span>
                <span className="text-[10px] text-primary font-medium w-20 text-center flex items-center justify-center gap-1">
                  <Check className="h-3 w-3 shrink-0" />
                  <span className="truncate">{perk.premium.split(' ').slice(0, 3).join(' ')}</span>
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Upgrade CTA for non-premium */}
      {!isPremium && (
        <div className="p-4 pt-2 border-t border-border/50">
          <UpgradeButton
            label="Unlock All Premium Powers"
            className="w-full h-11 font-bold gap-2"
          />
        </div>
      )}
    </motion.div>
  );
}
