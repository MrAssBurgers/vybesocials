import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Laugh, Mic, Flame, Clock, Sparkles,
  Upload, MessageSquare, Palette, Shield, Lock, Check,
  ChevronRight, Zap, Star
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { UpgradeButton } from '@/components/premium/UpgradeButton';

interface PerkItem {
  id: string;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  available: boolean;
}

const PREMIUM_PERKS: PerkItem[] = [
  {
    id: 'meme-ban',
    icon: Laugh,
    label: 'Meme Ban Powers',
    description: 'Ban users with custom memes for up to 5 minutes',
    color: 'from-amber-500 to-orange-600',
    available: true,
  },
  {
    id: 'voice',
    icon: Mic,
    label: 'Voice Messages',
    description: 'Record and send voice messages in DMs',
    color: 'from-red-500 to-rose-600',
    available: true,
  },
  {
    id: 'vanish',
    icon: Flame,
    label: 'Vanish Mode',
    description: 'Send self-destructing messages that disappear',
    color: 'from-pink-500 to-fuchsia-600',
    available: true,
  },
  {
    id: 'schedule',
    icon: Clock,
    label: 'Scheduled Messages',
    description: 'Schedule messages to send later automatically',
    color: 'from-cyan-500 to-blue-600',
    available: true,
  },
  {
    id: 'effects',
    icon: Sparkles,
    label: 'Message Effects',
    description: 'Add animations and visual effects to messages',
    color: 'from-yellow-500 to-amber-600',
    available: true,
  },
  {
    id: 'uploads',
    icon: Upload,
    label: '50MB Uploads',
    description: 'Upload larger files and high-res media',
    color: 'from-emerald-500 to-green-600',
    available: true,
  },
  {
    id: 'cosmetics',
    icon: Palette,
    label: 'Premium Cosmetics',
    description: 'Exclusive colors, frames, effects & themes',
    color: 'from-purple-500 to-violet-600',
    available: true,
  },
  {
    id: 'read-receipts',
    icon: MessageSquare,
    label: 'Read Receipt Control',
    description: 'Hide when you read messages from others',
    color: 'from-blue-500 to-indigo-600',
    available: true,
  },
  {
    id: 'secret-chats',
    icon: Shield,
    label: 'Secret Chats',
    description: 'End-to-end encrypted private conversations',
    color: 'from-slate-500 to-zinc-600',
    available: true,
  },
  {
    id: 'reactions',
    icon: Star,
    label: 'Exclusive Reactions',
    description: 'Premium-only reaction emojis and animations',
    color: 'from-orange-500 to-red-600',
    available: true,
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
            <h3 className="font-semibold text-sm">Premium Powers</h3>
            <p className="text-[10px] text-muted-foreground">
              {isPremium ? 'All features unlocked' : 'Upgrade to unlock'}
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

      {/* Perks List */}
      <div className="px-2 pb-2">
        {PREMIUM_PERKS.map((perk, i) => {
          const Icon = perk.icon;
          const isLocked = !isPremium;
          return (
            <motion.div
              key={perk.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.03 }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                isLocked ? "opacity-50" : "hover:bg-muted/40"
              )}
            >
              <div className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br",
                perk.color,
                isLocked && "grayscale"
              )}>
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "text-sm font-medium truncate",
                    isLocked && "text-muted-foreground"
                  )}>
                    {perk.label}
                  </span>
                  {perk.id === 'meme-ban' && isPremium && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold">
                      MAX 5 MIN
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-[11px] truncate",
                  isLocked ? "text-muted-foreground/60" : "text-muted-foreground"
                )}>
                  {perk.description}
                </p>
              </div>
              {isLocked ? (
                <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              ) : (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
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
