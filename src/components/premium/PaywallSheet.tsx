import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown, Check, Sparkles, Zap, Shield, Star, Loader2,
  Music, Eye, Palette, MessageSquare, Clock,
  Gift, Cat, BarChart3, Rocket, Upload,
  Wand2, Paintbrush, Bomb, Dice1, Lock,
  Ban, Send, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
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

// ── Premium Perks (grouped into 3 clear sections) ──
const PERK_SECTIONS = [
  {
    id: 'social',
    title: 'Social & Chat',
    icon: MessageSquare,
    gradient: 'from-blue-500 to-indigo-500',
    perks: [
      { icon: Shield, label: 'Ad-free experience', desc: 'No ads anywhere in the app' },
      { icon: Eye, label: 'Profile visitor tracker', desc: 'See who viewed your profile' },
      { icon: Lock, label: 'Read receipt control', desc: 'Toggle per conversation' },
      { icon: Clock, label: 'Message scheduling', desc: 'Schedule DMs to send later' },
      { icon: Bomb, label: 'Chat effects', desc: 'Confetti, screen-shake & more' },
      { icon: Gift, label: 'Gift Premium', desc: 'Send Pro to a friend' },
      { icon: Send, label: 'Priority support', desc: 'Get help faster' },
    ],
  },
  {
    id: 'creator',
    title: 'Creator Tools',
    icon: Rocket,
    gradient: 'from-amber-500 to-orange-500',
    perks: [
      { icon: Music, label: 'Profile music', desc: 'Set a song on your profile' },
      { icon: Upload, label: '50MB uploads', desc: 'High-res media & larger files' },
      { icon: BarChart3, label: 'Post analytics', desc: 'Views, reach & engagement' },
      { icon: Clock, label: 'Post scheduling', desc: 'Queue posts for later' },
      { icon: Rocket, label: 'Priority in Explore', desc: 'Your content surfaces higher' },
      { icon: Zap, label: 'Longer clips', desc: '3 min vs 1 min limit' },
      { icon: Star, label: 'Early access', desc: 'Try new features first' },
    ],
  },
  {
    id: 'style',
    title: 'Style & Cosmetics',
    icon: Palette,
    gradient: 'from-purple-500 to-pink-500',
    perks: [
      { icon: Sparkles, label: 'Animated profile borders', desc: 'Flame, holo, lightning & more' },
      { icon: Wand2, label: 'Name effects', desc: 'Glitch, drip & plasma text' },
      { icon: Star, label: 'Custom emoji reactions', desc: 'Upload your own emojis' },
      { icon: Paintbrush, label: 'Premium fonts', desc: 'Exclusive display fonts' },
      { icon: Palette, label: 'Unlimited AI themes', desc: 'No cooldown on AI designer' },
      { icon: Ban, label: 'Custom status badges', desc: 'Create your own status' },
      { icon: Dice1, label: 'Daily loot box', desc: 'Random cosmetics each day' },
      { icon: Cat, label: 'Profile pet', desc: 'Animated pet on your profile' },
      { icon: Crown, label: 'OG Flex badge', desc: 'Shows how long you\'ve been Pro' },
    ],
  },
];

const totalPerks = PERK_SECTIONS.reduce((sum, s) => sum + s.perks.length, 0);

// ── Helpers ──
function formatPrice(pkg: RCPackage): string {
  const product = pkg.rcBillingProduct;
  return product.currentPrice?.formattedPrice || 'Free';
}

function formatInterval(pkg: RCPackage): string {
  switch (pkg.packageType) {
    case '$rc_monthly': return '/mo';
    case '$rc_annual': return '/yr';
    case '$rc_weekly': return '/wk';
    case '$rc_lifetime': return ' once';
    case '$rc_six_month': return '/6mo';
    case '$rc_three_month': return '/3mo';
    case '$rc_two_month': return '/2mo';
    default: return '';
  }
}

// ── Main Component ──
export function PaywallSheet({ open, onOpenChange }: PaywallSheetProps) {
  const { offerings, purchase, isEntitled, isLoading, error, retryLoadOfferings } = useRevenueCat();
  const [selectedPkg, setSelectedPkg] = useState<RCPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);

  const isPremium = isEntitled('Vybe Social Pro');

  const handlePurchase = async () => {
    const pkg = selectedPkg || offerings[0];
    if (!pkg) return;
    setPurchasing(true);
    try {
      await purchase(pkg);
      toast.success('Welcome to VYBE Pro! 🎉');
      onOpenChange(false);
    } catch (err: any) {
      if (!err?.message?.includes('cancelled')) toast.error('Purchase failed. Please try again.');
    } finally { setPurchasing(false); }
  };

  const handleStripeCheckout = useCallback(async () => {
    setStripeLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-premium-checkout');
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (data?.mode === 'test' && window.location.hostname === 'vybehub.app') {
        toast.warning('Payments are in test mode. Contact support to enable live payments.');
      }
      if (data?.url) {
        window.open(data.url, '_blank');
        toast.success('Opening checkout...');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not start checkout');
    } finally { setStripeLoading(false); }
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    await retryLoadOfferings();
    setRetrying(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl p-0 flex flex-col">
        {/* Hero */}
        <div className="relative pt-8 pb-4 px-6 text-center shrink-0">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/8 via-transparent to-transparent rounded-t-3xl pointer-events-none" />

          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 250, damping: 18 }}
            className="relative mx-auto mb-4 h-20 w-20 rounded-[22px] bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center shadow-lg"
            style={{ boxShadow: '0 8px 32px hsl(var(--primary) / 0.3)' }}
          >
            <Crown className="h-10 w-10 text-primary-foreground" />
            <motion.div
              className="absolute -top-1.5 -right-1.5 h-7 w-7 rounded-full bg-card flex items-center justify-center border-2 border-primary shadow-md"
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </motion.div>
          </motion.div>

          <SheetHeader className="space-y-1">
            <SheetTitle className="text-2xl font-black tracking-tight">
              {isPremium ? 'You\'re Pro! 👑' : 'VYBE Pro'}
            </SheetTitle>
            <SheetDescription className="text-sm">
              {isPremium
                ? 'All features unlocked. Enjoy!'
                : <>Unlock <span className="font-semibold text-primary">{totalPerks} features</span> across Social, Creator & Style</>
              }
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Feature sections */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-5 pb-4">
            {PERK_SECTIONS.map((section, si) => {
              const SectionIcon = section.icon;
              return (
                <motion.div
                  key={section.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: si * 0.08 }}
                >
                  {/* Section header */}
                  <div className="flex items-center gap-2.5 mb-2.5 px-1">
                    <div className={cn("h-7 w-7 rounded-lg bg-gradient-to-br flex items-center justify-center", section.gradient)}>
                      <SectionIcon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <h3 className="text-sm font-bold">{section.title}</h3>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">
                      {section.perks.length}
                    </Badge>
                  </div>

                  {/* Perk rows */}
                  <div className="space-y-1">
                    {section.perks.map((perk, pi) => (
                      <motion.div
                        key={perk.label}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: si * 0.08 + pi * 0.03 }}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-secondary/30 transition-colors"
                      >
                        <div className="h-7 w-7 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
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
              );
            })}
          </div>
        </ScrollArea>

        {/* Sticky CTA */}
        {!isPremium && (
          <div className="shrink-0 px-5 pt-3 pb-6 border-t border-border/50 bg-background/80 backdrop-blur-xl space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : offerings.length > 0 ? (
              <>
                <div className="flex gap-2">
                  {offerings.map((pkg, i) => {
                    const isSelected = selectedPkg?.identifier === pkg.identifier || (!selectedPkg && i === 0);
                    const isAnnual = pkg.packageType === '$rc_annual';
                    return (
                      <button key={pkg.identifier} onClick={() => setSelectedPkg(pkg)}
                        className={cn(
                          "relative flex-1 p-3 rounded-xl border-2 text-center transition-all",
                          isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        )}
                      >
                        {isAnnual && (
                          <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] px-1.5 py-0">
                            BEST VALUE
                          </Badge>
                        )}
                        <p className="text-base font-bold">{formatPrice(pkg)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatInterval(pkg)}</p>
                      </button>
                    );
                  })}
                </div>
                <Button size="lg" className="w-full h-12 text-base font-bold rounded-xl" disabled={purchasing} onClick={handlePurchase}>
                  {purchasing
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                    : <><Crown className="h-4 w-4 mr-2" />Get VYBE Pro</>
                  }
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground text-center">
                  {error === 'init_failed' ? "Couldn't connect to the store. Try Stripe instead."
                    : error === 'no_offerings' ? "No in-app plans available. Use Stripe below."
                    : "Couldn't load plans. Try Stripe or retry."}
                </p>
                <Button size="lg" className="w-full h-12 font-bold rounded-xl" onClick={handleStripeCheckout} disabled={stripeLoading}>
                  {stripeLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Opening checkout...</>
                    : <><Crown className="h-4 w-4 mr-2" />Subscribe via Stripe — $9.99/mo</>
                  }
                </Button>
                <Button size="sm" variant="outline" className="w-full rounded-xl" onClick={handleRetry} disabled={retrying}>
                  {retrying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Retrying...</> : 'Retry Loading Plans'}
                </Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground text-center">Cancel anytime · Renews automatically</p>
          </div>
        )}

        {isPremium && (
          <div className="shrink-0 px-6 pb-6 pt-3 text-center">
            <Badge className="bg-primary/20 text-primary text-sm px-5 py-2 rounded-full">
              <Crown className="h-4 w-4 mr-2" /> Active Pro Member
            </Badge>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
