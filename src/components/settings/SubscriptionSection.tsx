import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Check, Sparkles, Shield, Loader2, ExternalLink,
  Calendar, CreditCard, Gift, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { PaywallSheet } from '@/components/premium/PaywallSheet';
import { SubscriptionLocker } from '@/components/settings/SubscriptionLocker';
import { PremiumPerkActions } from '@/components/settings/PremiumPerkActions';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useRevenueCat } from '@/hooks/useRevenueCat';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const PERKS_SUMMARY = [
  { icon: Sparkles, label: 'Animated Profile Borders & Effects' },
  { icon: Crown, label: 'Meme Ban Powers & Custom GIFs' },
  { icon: Shield, label: 'Secret Chats & Read Receipt Control' },
  { icon: CreditCard, label: '50MB Uploads & Bigger Limits' },
  { icon: Gift, label: 'Daily Loot Box & Exclusive Reactions' },
  { icon: Calendar, label: 'Post & Message Scheduling' },
];

export function SubscriptionSection() {
  const { t } = useTranslation();
  const { isPremium, isLoading, isOwner, isGifted, customerInfo } = usePremiumStatus();
  const { offerings, refresh } = useRevenueCat();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Derive subscription details from RevenueCat customerInfo
  const activeEntitlement = customerInfo?.entitlements?.active?.['Vybe Social Pro'];
  const expiresDate = activeEntitlement?.expirationDate
    ? new Date(activeEntitlement.expirationDate)
    : null;
  const willRenew = activeEntitlement?.willRenew ?? false;
  const store = activeEntitlement?.store;
  const productId = activeEntitlement?.productIdentifier;

  const isRCSubscriber = !!activeEntitlement;

  const getPlanLabel = () => {
    if (!productId) return 'Premium';
    if (productId.includes('lifetime')) return 'Lifetime';
    if (productId.includes('annual') || productId.includes('yearly')) return 'Annual';
    if (productId.includes('monthly')) return 'Monthly';
    if (productId.includes('weekly')) return 'Weekly';
    return 'Premium';
  };

  const getStatusBadge = () => {
    if (isOwner) return { label: 'Owner', variant: 'default' as const, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    if (isGifted) return { label: 'Gifted', variant: 'default' as const, color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' };
    if (willRenew) return { label: 'Active', variant: 'default' as const, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    if (activeEntitlement) return { label: 'Expiring', variant: 'default' as const, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    return { label: 'Free', variant: 'secondary' as const, color: '' };
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      toast.success('Subscription status refreshed');
    } catch {
      toast.error('Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const handleManageSubscription = () => {
    // RevenueCat web subscriptions are managed via the billing portal
    if (customerInfo?.managementURL) {
      window.open(customerInfo.managementURL, '_blank');
    } else {
      // Fallback: direct to store-specific management
      const urls: Record<string, string> = {
        app_store: 'https://apps.apple.com/account/subscriptions',
        play_store: 'https://play.google.com/store/account/subscriptions',
        stripe: customerInfo?.managementURL || '',
      };
      const url = store ? urls[store] : null;
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.info('Open your app store to manage your subscription');
      }
    }
  };

  const status = getStatusBadge();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Current Plan Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "rounded-2xl border p-5",
          isPremium
            ? "bg-gradient-to-br from-primary/5 via-accent/5 to-primary/5 border-primary/20"
            : "bg-card border-border"
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center",
              isPremium ? "bg-primary/15" : "bg-muted"
            )}>
              <Crown className={cn("h-6 w-6", isPremium ? "text-primary" : "text-muted-foreground")} />
            </div>
            <div>
              <h3 className="font-bold text-base">
                {isPremium ? `VYBE ${getPlanLabel()}` : 'VYBE Free'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isPremium
                  ? isOwner
                    ? 'Complimentary owner access'
                    : isGifted
                      ? 'Premium gifted to you'
                      : 'All premium features unlocked'
                  : 'Upgrade to unlock 40+ perks'}
              </p>
            </div>
          </div>
          <Badge className={cn("text-[10px] border", status.color)}>
            {status.label}
          </Badge>
        </div>

        {/* Subscription Details */}
        {isPremium && isRCSubscriber && (
          <div className="space-y-2.5 mb-4">
            {expiresDate && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {willRenew ? 'Renews' : 'Expires'}
                </span>
                <span className="font-medium">
                  {expiresDate.toLocaleDateString(undefined, {
                    month: 'long', day: 'numeric', year: 'numeric'
                  })}
                </span>
              </div>
            )}
            {store && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5" />
                  Billed via
                </span>
                <span className="font-medium capitalize">
                  {store.replace('_', ' ')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {!isPremium && (
            <Button
              className="w-full gap-2 font-bold h-11"
              onClick={() => setShowPaywall(true)}
            >
              <Crown className="h-4 w-4" />
              Upgrade to Premium
            </Button>
          )}

          {isPremium && isRCSubscriber && (
            <>
              <Button
                variant="outline"
                className="w-full justify-between h-11"
                onClick={handleManageSubscription}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Manage Subscription
                </span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </Button>

              {willRenew && (
                <Button
                  variant="outline"
                  className="w-full justify-between h-11 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => setShowCancelDialog(true)}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Cancel Subscription
                  </span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </>
          )}

          {isPremium && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : null}
              Refresh subscription status
            </Button>
          )}
        </div>
      </motion.div>

      {/* Perks Summary */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">
            {isPremium ? 'Your Premium Perks' : 'What You Get'}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary h-7"
            onClick={() => setShowPaywall(true)}
          >
            View all 40+ perks
          </Button>
        </div>
        <div className="space-y-2">
          {PERKS_SUMMARY.map((perk, i) => (
            <motion.div
              key={perk.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.04 }}
              className="flex items-center gap-3 py-1.5"
            >
              <div className={cn(
                "h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                isPremium ? "bg-primary/10" : "bg-muted"
              )}>
                <perk.icon className={cn(
                  "h-3.5 w-3.5",
                  isPremium ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <span className="text-sm flex-1">{perk.label}</span>
              {isPremium && (
                <Check className="h-4 w-4 text-primary shrink-0" />
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Premium Powers & Actions */}
      <PremiumPerkActions />

      {/* Equippable Cosmetics */}
      <SubscriptionLocker />

      {/* Restore / Help */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border border-border bg-card p-4"
      >
        <div className="space-y-2">
          <Button
            variant="ghost"
            className="w-full justify-between text-sm h-10"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <span>Restore Purchases</span>
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Separator />
          <p className="text-[10px] text-muted-foreground text-center py-1">
            Subscriptions auto-renew unless cancelled at least 24 hours before
            the end of the current period. Manage or cancel anytime from your
            account settings.
          </p>
        </div>
      </motion.div>

      {/* Paywall Sheet */}
      <PaywallSheet open={showPaywall} onOpenChange={setShowPaywall} />

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancel Premium?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You'll lose access to all 40+ premium perks including animated borders,
                meme ban powers, bigger uploads, and more.
              </p>
              {expiresDate && (
                <p className="font-medium text-foreground">
                  Your premium access will remain active until{' '}
                  {expiresDate.toLocaleDateString(undefined, {
                    month: 'long', day: 'numeric', year: 'numeric'
                  })}.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Premium</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleManageSubscription}
            >
              Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
