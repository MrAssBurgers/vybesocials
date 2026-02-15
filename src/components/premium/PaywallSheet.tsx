import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Check, Sparkles, Zap, Shield, Star, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import type { Package as RCPackage } from '@revenuecat/purchases-js';

interface PaywallSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PERKS = [
  { icon: Sparkles, label: 'Exclusive cosmetics & effects' },
  { icon: Shield, label: 'Priority support & moderation' },
  { icon: Zap, label: '2× XP boost on all activities' },
  { icon: Star, label: 'Premium badge & profile frame' },
];

function formatPrice(pkg: RCPackage): string {
  const product = pkg.rcBillingProduct;
  if (product.currentPrice) {
    const price = product.currentPrice;
    return `${price.formattedPrice}`;
  }
  return 'Free';
}

function formatInterval(pkg: RCPackage): string {
  const id = pkg.packageType;
  switch (id) {
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

export function PaywallSheet({ open, onOpenChange }: PaywallSheetProps) {
  const { offerings, purchase, isEntitled, isLoading } = useRevenueCat();
  const [selectedPkg, setSelectedPkg] = useState<RCPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const isPremium = isEntitled('premium');

  const handlePurchase = async () => {
    const pkg = selectedPkg || offerings[0];
    if (!pkg) return;

    setPurchasing(true);
    try {
      await purchase(pkg);
      toast.success('Welcome to VYBE Premium! 🎉');
      onOpenChange(false);
    } catch (err: any) {
      if (err?.message?.includes('cancelled')) {
        // User cancelled, no toast needed
      } else {
        toast.error('Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[92vh] rounded-t-3xl overflow-y-auto">
        {/* Hero */}
        <div className="relative pt-2 pb-6 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 via-accent/20 to-primary/10 flex items-center justify-center"
          >
            <Crown className="h-8 w-8 text-primary" />
          </motion.div>

          <SheetHeader className="space-y-1">
            <SheetTitle className="text-2xl font-bold">
              {isPremium ? 'You\'re Premium!' : 'Upgrade to Premium'}
            </SheetTitle>
            <SheetDescription className="text-base">
              {isPremium
                ? 'Enjoy all your premium perks'
                : 'Unlock the full VYBE experience'}
            </SheetDescription>
          </SheetHeader>
        </div>

        {/* Perks */}
        <div className="space-y-3 mb-6">
          {PERKS.map((perk, i) => (
            <motion.div
              key={perk.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/30 border border-border/50"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <perk.icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium">{perk.label}</span>
              <Check className="h-4 w-4 text-primary ml-auto shrink-0" />
            </motion.div>
          ))}
        </div>

        {/* Package selection */}
        {!isPremium && (
          <>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : offerings.length > 0 ? (
              <div className="grid gap-3 mb-6">
                {offerings.map((pkg, i) => {
                  const isSelected = selectedPkg?.identifier === pkg.identifier
                    || (!selectedPkg && i === 0);
                  const isAnnual = pkg.packageType === '$rc_annual';

                  return (
                    <motion.button
                      key={pkg.identifier}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.08 }}
                      onClick={() => setSelectedPkg(pkg)}
                      className={cn(
                        "relative w-full p-4 rounded-xl border-2 text-left transition-all",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      {isAnnual && (
                        <Badge className="absolute -top-2.5 right-3 bg-primary text-primary-foreground text-[10px]">
                          Best Value
                        </Badge>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">
                            {pkg.rcBillingProduct.title || pkg.identifier}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {pkg.rcBillingProduct.description || 'Full premium access'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold">{formatPrice(pkg)}</p>
                          <p className="text-xs text-muted-foreground">{formatInterval(pkg)}</p>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-sm mb-6">
                No plans available right now. Check back later!
              </div>
            )}

            <Button
              size="lg"
              className="w-full text-base font-semibold"
              disabled={purchasing || (offerings.length === 0)}
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
                  Subscribe Now
                </>
              )}
            </Button>

            <p className="text-[11px] text-muted-foreground text-center mt-3 pb-2">
              Cancel anytime. Subscription renews automatically.
            </p>
          </>
        )}

        {isPremium && (
          <div className="text-center pb-4">
            <Badge className="bg-primary/20 text-primary text-sm px-4 py-1.5">
              <Crown className="h-3.5 w-3.5 mr-1.5" />
              Active Premium Member
            </Badge>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
