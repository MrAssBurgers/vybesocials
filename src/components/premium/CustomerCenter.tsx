import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Loader2, RefreshCw, ExternalLink, HelpCircle,
  Mail, ChevronRight, RotateCcw, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useRevenueCat } from '@/hooks/useRevenueCat';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CustomerCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerCenter({ open, onOpenChange }: CustomerCenterProps) {
  const { customerInfo, refresh } = useRevenueCat();
  const { isPremium, isOwner, isGifted } = usePremiumStatus();
  const [refreshing, setRefreshing] = useState(false);

  const activeEntitlement = customerInfo?.entitlements?.active?.['Vybe Social Pro'];
  const expiresDate = activeEntitlement?.expirationDate
    ? new Date(activeEntitlement.expirationDate)
    : null;
  const willRenew = activeEntitlement?.willRenew ?? false;
  const store = activeEntitlement?.store;
  const managementURL = customerInfo?.managementURL;

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

  const handleManage = () => {
    if (managementURL) {
      window.open(managementURL, '_blank');
    } else {
      const urls: Record<string, string> = {
        app_store: 'https://apps.apple.com/account/subscriptions',
        play_store: 'https://play.google.com/store/account/subscriptions',
      };
      const url = store ? urls[store] : null;
      if (url) {
        window.open(url, '_blank');
      } else {
        toast.info('Open your app store to manage your subscription');
      }
    }
  };

  const menuItems = [
    ...(activeEntitlement
      ? [
          {
            icon: ExternalLink,
            label: 'Manage Subscription',
            desc: 'Change plan, update payment, or cancel',
            action: handleManage,
          },
        ]
      : []),
    {
      icon: RotateCcw,
      label: 'Restore Purchases',
      desc: 'Sync purchases from another device',
      action: handleRefresh,
      loading: refreshing,
    },
    {
      icon: Mail,
      label: 'Contact Support',
      desc: 'Get help with billing or subscription issues',
      action: () => window.open('mailto:support@vybehub.app?subject=Subscription%20Help', '_blank'),
    },
    {
      icon: HelpCircle,
      label: 'FAQ',
      desc: 'Common questions about VYBE Premium',
      action: () => toast.info('FAQ coming soon!'),
    },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl p-0 flex flex-col">
        <div className="px-6 pt-6 pb-4 shrink-0">
          <SheetHeader className="space-y-1">
            <SheetTitle className="text-xl font-bold">Subscription Center</SheetTitle>
            <SheetDescription>Manage your VYBE Premium subscription</SheetDescription>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5">
          {/* Status Card */}
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
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-12 w-12 rounded-2xl flex items-center justify-center",
                isPremium ? "bg-primary/15" : "bg-muted"
              )}>
                <Crown className={cn("h-6 w-6", isPremium ? "text-primary" : "text-muted-foreground")} />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base">
                  {isPremium ? 'VYBE Premium Active' : 'VYBE Free'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isOwner
                    ? 'Complimentary owner access'
                    : isGifted
                      ? 'Premium gifted to you'
                      : isPremium
                        ? willRenew
                          ? `Renews ${expiresDate?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : `Expires ${expiresDate?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : 'Upgrade to unlock 40+ perks'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Menu Items */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {menuItems.map((item, i) => (
              <motion.div key={item.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                {i > 0 && <Separator />}
                <button
                  onClick={item.action}
                  disabled={'loading' in item && item.loading}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    {'loading' in item && item.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </motion.div>
            ))}
          </div>

          {/* Subscription ID */}
          {customerInfo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center space-y-1"
            >
              <p className="text-[10px] text-muted-foreground">
                Customer ID: {customerInfo.originalAppUserId?.slice(0, 16)}...
              </p>
              <p className="text-[10px] text-muted-foreground">
                Subscriptions auto-renew unless cancelled 24h before renewal.
              </p>
            </motion.div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
