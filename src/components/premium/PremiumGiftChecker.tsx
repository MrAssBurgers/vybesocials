import { AnimatePresence } from 'framer-motion';
import { usePendingPremiumGift } from '@/hooks/usePendingPremiumGift';
import { PremiumGiftNotification } from './PremiumGiftNotification';
import { useState, useEffect } from 'react';

/**
 * Global component that checks for pending premium gifts and shows
 * the acceptance popup. Mount once in App.
 */
export function PremiumGiftChecker() {
  const { data: pendingGift } = usePendingPremiumGift();
  const [dismissed, setDismissed] = useState(false);
  const [activeGift, setActiveGift] = useState<typeof pendingGift>(null);

  useEffect(() => {
    if (pendingGift && !dismissed) {
      setActiveGift(pendingGift);
    }
  }, [pendingGift, dismissed]);

  if (!activeGift) return null;

  return (
    <AnimatePresence>
      <PremiumGiftNotification
        giftId={activeGift.id}
        gifterUsername={activeGift.gifterUsername}
        onDismiss={() => {
          setDismissed(true);
          setActiveGift(null);
        }}
      />
    </AnimatePresence>
  );
}
