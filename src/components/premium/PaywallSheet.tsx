import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, Check, Sparkles, Zap, Shield, Star, Loader2,
  Flame, Music, Eye, Palette, MessageSquare, Pin,
  BarChart3, Clock, Rocket, Gift, Dice1, ChevronDown,
  Bomb, Cat, Send, Lock, Upload, Volume2, Trophy,
  Undo2, Receipt, Wand2, Paintbrush, LayoutGrid,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useRevenueCat } from '@/hooks/useRevenueCat';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Package as RCPackage } from '@revenuecat/purchases-js';

interface PaywallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ── Perk Categories ─────────────────────────────────────────────
const PERK_CATEGORIES = [
  {
    id: 'bans',
    title: '🎬 Meme Ban Powers',
    subtitle: 'Mod & Admin exclusive chaos tools',
    gradient: 'from-red-500/20 to-orange-500/20',
    borderColor: 'border-red-500/30',
    perks: [
      { icon: Flame, label: 'Custom Ban GIFs', desc: 'Upload your own fullscreen meme on ban' },
      { icon: Volume2, label: 'Ban Sound Effects', desc: 'Cursed sounds or upload your own' },
      { icon: Trophy, label: 'Ban Streak Counter', desc: '"Top Banners" leaderboard flex' },
      { icon: Undo2, label: 'UNO Reverse Card', desc: 'Reflect a ban back (1/week)' },
      { icon: Rocket, label: 'Ban Entrance Animation', desc: 'Your ban gets a dramatic intro' },
      { icon: Receipt, label: 'Ban Receipt', desc: 'Auto-generated meme receipt image' },
    ],
  },
  {
    id: 'flex',
    title: '💎 Social Flex',
    subtitle: 'Make everyone jealous',
    gradient: 'from-purple-500/20 to-pink-500/20',
    borderColor: 'border-purple-500/30',
    perks: [
      { icon: Sparkles, label: 'Animated Profile Borders', desc: 'Flame, holographic, dripping, lightning' },
      { icon: Star, label: 'Custom Emoji Reactions', desc: 'Upload personal emojis to react' },
      { icon: Bomb, label: 'Chat Effects', desc: 'Screen-shake, confetti, rain, earthquake' },
      { icon: Wand2, label: 'Exclusive Name Effects', desc: 'Dripping, glitching, plasma text' },
      { icon: Music, label: 'Profile Music', desc: 'Set a song that plays on your profile' },
      { icon: Shield, label: 'Custom Status Badges', desc: 'Create your own status with emoji' },
      { icon: Eye, label: 'Profile Visitor Tracker', desc: 'See who\'s stalking your profile' },
    ],
  },
  {
    id: 'customize',
    title: '🎨 Customization',
    subtitle: 'Your VYBE, your rules',
    gradient: 'from-cyan-500/20 to-blue-500/20',
    borderColor: 'border-cyan-500/30',
    perks: [
      { icon: Palette, label: 'Unlimited AI Themes', desc: 'No cooldown on AI VYBE designer' },
      { icon: Upload, label: 'Animated Banners', desc: 'Upload GIFs/videos as profile banner' },
      { icon: Paintbrush, label: 'Premium Font Packs', desc: 'Exclusive display fonts' },
      { icon: Palette, label: 'Custom Color Palette', desc: 'Full HSL picker, no presets needed' },
      { icon: LayoutGrid, label: 'Profile Layouts', desc: 'Grid, masonry, or magazine style' },
    ],
  },
  {
    id: 'chat',
    title: '💬 Chat & Social',
    subtitle: 'Next-level messaging',
    gradient: 'from-green-500/20 to-emerald-500/20',
    borderColor: 'border-green-500/30',
    perks: [
      { icon: Clock, label: 'Message Scheduling', desc: 'Schedule DMs to send later' },
      { icon: Lock, label: 'Secret Chats', desc: 'Self-destructing encrypted messages' },
      { icon: Upload, label: 'Bigger File Uploads', desc: '50MB vs 20MB limit' },
      { icon: Send, label: 'Priority Support', desc: 'Get help faster from our team' },
      { icon: Eye, label: 'Read Receipt Control', desc: 'Toggle per conversation' },
      { icon: Gift, label: 'Gift Premium', desc: 'Send premium to a friend' },
    ],
  },
  {
    id: 'content',
    title: '📱 Feed & Content',
    subtitle: 'Creator-grade tools',
    gradient: 'from-yellow-500/20 to-amber-500/20',
    borderColor: 'border-yellow-500/30',
    perks: [
      { icon: Pin, label: 'Pin Posts', desc: 'Pin up to 3 posts to your profile' },
      { icon: BarChart3, label: 'Post Analytics', desc: 'Views, reach, engagement stats' },
      { icon: Clock, label: 'Post Scheduling', desc: 'Queue posts for later' },
      { icon: Rocket, label: 'Priority in Explore', desc: 'Your content surfaces higher' },
      { icon: Flame, label: 'Longer Clips', desc: '3min vs 1min clip limit' },
      { icon: Zap, label: 'Early Access', desc: 'Try new features first' },
      { icon: Shield, label: 'Ad-Free Experience', desc: 'No ads anywhere in the app' },
    ],
  },
  {
    id: 'chaos',
    title: '🎮 Fun & Chaos',
    subtitle: 'Because why not',
    gradient: 'from-pink-500/20 to-rose-500/20',
    borderColor: 'border-pink-500/30',
    perks: [
      { icon: Dice1, label: 'Daily Loot Box', desc: 'Random cosmetic/effect each day' },
      { icon: Star, label: 'Rare Reaction Pack', desc: 'Animated exclusive reactions' },
      { icon: Cat, label: 'Profile Pet', desc: 'Animated pet vibing on your profile' },
      { icon: Bomb, label: 'Chat Bombs', desc: 'Explosive full-screen animations in groups' },
      { icon: Wand2, label: 'April Fools Mode', desc: 'Flip someone\'s UI upside down (1/day)' },
      { icon: Crown, label: 'OG Flex Badge', desc: 'Shows how long you\'ve been premium' },
    ],
  },
];

// ── Collapsible Category ────────────────────────────────────────
function PerkCategory({ category, index }: { category: typeof PERK_CATEGORIES[0]; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full text-left p-4 rounded-2xl border transition-all",
          "bg-gradient-to-r",
          category.gradient,
          category.borderColor,
          expanded && "ring-1 ring-primary/20"
        )}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">{category.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{category.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
              {category.perks.length} perks
            </Badge>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </motion.div>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pl-2 pr-1 space-y-1.5">
              {category.perks.map((perk, i) => (
                <motion.div
                  key={perk.label}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/20 border border-border/30"
                >
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <perk.icon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{perk.label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{perk.desc}</p>
                  </div>
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────
function formatPrice(pkg: RCPackage): string {
  const product = pkg.rcBillingProduct;
  if (product.currentPrice) {
    return `${product.currentPrice.formattedPrice}`;
  }
  return 'Free';
}

function formatInterval(pkg: RCPackage): string {
  switch (pkg.packageType) {
    case '$rc_monthly': return '/month';
    case '$rc_annual': return '/year';
    case '$rc_weekly': return '/week';
    case '$rc_lifetime': return ' lifetime';
    case '$rc_six_month': return '/6 months';
    case '$rc_three_month': return '/3 months';
    case '$rc_two_month': return '/2 months';
    default: return '';
  }
}

const totalPerks = PERK_CATEGORIES.reduce((sum, c) => sum + c.perks.length, 0);

// ── Main Component ──────────────────────────────────────────────
export function PaywallSheet({ open, onOpenChange }: PaywallSheetProps) {
  const { offerings, purchase, isEntitled, isLoading, error, retryLoadOfferings } = useRevenueCat();
  const [selectedPkg, setSelectedPkg] = useState<RCPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await retryLoadOfferings();
    setRetrying(false);
  };

  const isPremium = isEntitled('Vybe Social Pro');

  const handlePurchase = async () => {
    const pkg = selectedPkg || offerings[0];
    if (!pkg) return;

    setPurchasing(true);
    try {
      await purchase(pkg);
      toast.success('Welcome to VYBE Premium! 🎉');
      onOpenChange(false);
    } catch (err: any) {
      if (!err?.message?.includes('cancelled')) {
        toast.error('Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[94vh] rounded-t-3xl p-0 flex flex-col">
        {/* Hero - fixed at top */}
        <div className="relative pt-6 pb-4 px-6 text-center shrink-0">
          {/* Decorative glow */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent rounded-t-3xl pointer-events-none" />

          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="relative mx-auto mb-3 h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 flex items-center justify-center border border-primary/20"
          >
            <Crown className="h-10 w-10 text-primary" />
            <motion.div
              className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-primary flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring' }}
            >
              <Sparkles className="h-3 w-3 text-primary-foreground" />
            </motion.div>
          </motion.div>

          <SheetHeader className="space-y-1">
            <SheetTitle className="text-2xl font-black tracking-tight">
              {isPremium ? 'You\'re Premium! 👑' : 'VYBE Premium'}
            </SheetTitle>
            <SheetDescription className="text-sm">
              {isPremium
                ? 'Enjoy all your premium perks'
                : (
                  <>
                    <span className="font-semibold text-primary">{totalPerks}+ perks</span>
                    {' '}across {PERK_CATEGORIES.length} categories. Totally worth it.
                  </>
                )}
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Scrollable perks */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-3 pb-4">
            {PERK_CATEGORIES.map((category, i) => (
              <PerkCategory key={category.id} category={category} index={i} />
            ))}
          </div>
        </ScrollArea>

        {/* Sticky bottom CTA */}
        {!isPremium && (
          <div className="shrink-0 px-6 pt-3 pb-6 border-t border-border/50 bg-background/80 backdrop-blur-xl">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : offerings.length > 0 ? (
              <>
                {/* Compact package selector */}
                <div className="flex gap-2 mb-3">
                  {offerings.map((pkg, i) => {
                    const isSelected = selectedPkg?.identifier === pkg.identifier
                      || (!selectedPkg && i === 0);
                    const isAnnual = pkg.packageType === '$rc_annual';

                    return (
                      <button
                        key={pkg.identifier}
                        onClick={() => setSelectedPkg(pkg)}
                        className={cn(
                          "relative flex-1 p-3 rounded-xl border-2 text-center transition-all",
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        )}
                      >
                        {isAnnual && (
                          <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] px-1.5 py-0">
                            SAVE
                          </Badge>
                        )}
                        <p className="text-base font-bold">{formatPrice(pkg)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatInterval(pkg)}</p>
                      </button>
                    );
                  })}
                </div>

                <Button
                  size="lg"
                  className="w-full text-base font-bold h-12"
                  disabled={purchasing}
                  onClick={handlePurchase}
                >
                  {purchasing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Get Premium Now
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {error === 'init_failed' 
                    ? "Couldn't connect to the store. Try Stripe checkout instead."
                    : error === 'no_offerings'
                    ? "No in-app plans available. Use Stripe checkout below."
                    : "Couldn't load plans. Try Stripe checkout or retry."}
                </p>
                
                {/* Stripe Fallback Button */}
                <Button
                  size="lg"
                  className="w-full h-12 font-bold"
                  onClick={async () => {
                    setStripeLoading(true);
                    try {
                      const { data, error: fnError } = await supabase.functions.invoke('create-premium-checkout');
                      if (fnError) throw fnError;
                      if (data?.error) throw new Error(data.error);
                      if (data?.url) {
                        window.open(data.url, '_blank');
                        toast.success('Opening Stripe checkout...');
                      }
                    } catch (err: any) {
                      toast.error(err?.message || 'Could not start checkout');
                    } finally {
                      setStripeLoading(false);
                    }
                  }}
                  disabled={stripeLoading}
                >
                  {stripeLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Opening checkout...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Subscribe via Stripe — $9.99/mo
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={handleRetry}
                  disabled={retrying}
                >
                  {retrying ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    'Retry Loading In-App Plans'
                  )}
                </Button>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center mt-2">
              Cancel anytime · Subscription renews automatically
            </p>
          </div>
        )}

        {isPremium && (
          <div className="shrink-0 px-6 pb-6 pt-3 text-center">
            <Badge className="bg-primary/20 text-primary text-sm px-5 py-2">
              <Crown className="h-4 w-4 mr-2" />
              Active Premium Member
            </Badge>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
