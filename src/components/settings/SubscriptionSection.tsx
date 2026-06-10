import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Crown, Heart, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomerCenter } from '@/components/premium/CustomerCenter';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';

/**
 * Subscription section — temporarily replaced with a "VYBE+ coming soon"
 * placeholder. Every feature is free right now. Existing Stripe / RevenueCat
 * subscribers still see the CustomerCenter so they can manage / cancel.
 */
export function SubscriptionSection() {
  const { isOwner, isGifted, customerInfo } = usePremiumStatus();
  const [centerOpen, setCenterOpen] = useState(false);
  const hasLegacySubscription = !!(customerInfo?.entitlements?.active && Object.keys(customerInfo.entitlements.active).length > 0);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden liquid-glass-card rounded-3xl p-6"
      >
        {/* Soft aurora wash */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none gradient-animated opacity-15"
        />
        <div className="relative z-10 flex flex-col items-center text-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">
            Everything is free right now
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            We're cooking up <span className="text-primary font-semibold">VYBE+</span> — a
            new premium tier with exclusive cosmetics, ad-free browsing, meme bans
            and more. Until it ships, every feature is unlocked for everyone.
            Enjoy <Heart className="inline h-3.5 w-3.5 text-primary -mt-0.5" />
          </p>
          {(isOwner || isGifted) && (
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-primary/15 text-primary font-semibold">
              <Crown className="h-3 w-3" />
              {isOwner ? 'Owner preview' : 'Gifted preview'}
            </span>
          )}
        </div>
      </motion.div>

      {hasLegacySubscription && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground px-1">
            You have an existing subscription. Manage it below.
          </p>
          <Button
            variant="outline"
            className="w-full justify-between h-12 rounded-2xl"
            onClick={() => setCenterOpen(true)}
          >
            <span className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              Manage subscription
            </span>
          </Button>
          <CustomerCenter open={centerOpen} onOpenChange={setCenterOpen} />
        </div>
      )}
    </div>
  );
}
