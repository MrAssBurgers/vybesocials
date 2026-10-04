import { motion } from 'framer-motion';
import { Check, Sparkles, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { MarketplaceItem } from '@/hooks/useTokenMarketplace';
import { isEquippableMarketplaceItem } from '@/lib/marketplaceEquip';
import { useTheme } from '@/lib/theme';

interface PurchaseSuccessModalProps {
  item: MarketplaceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEquip: () => void;
  onLocker: () => void;
  isEquipping?: boolean;
}

export function PurchaseSuccessModal({
  item,
  open,
  onOpenChange,
  onEquip,
  onLocker,
  isEquipping,
}: PurchaseSuccessModalProps) {
  const { reducedMotion } = useTheme();
  if (!item) return null;

  const canEquip = isEquippableMarketplaceItem(item.id);
  const isConsumable = item.kind === 'consumable';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-primary/20 bg-gradient-to-b from-background via-background to-primary/5">
        <DialogHeader className="items-center text-center space-y-3">
          <div className="relative flex items-center justify-center">
            <motion.div
              initial={reducedMotion ? false : { scale: 0.96, rotate: 0 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.18 }}
              className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/15 text-4xl ring-2 ring-primary/30 shadow-[0_0_40px_rgba(var(--primary-rgb,99,102,241),0.25)]"
            >
              {item.icon}
            </motion.div>
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg"
            >
              <Check className="h-4 w-4" />
            </motion.div>
            {!reducedMotion && Array.from({ length: 4 }).map((_, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0.4, 1, 0.6],
                  x: Math.cos((i * Math.PI * 2) / 8) * 56,
                  y: Math.sin((i * Math.PI * 2) / 8) * 56,
                }}
                transition={{ duration: 0.9, delay: 0.1 + i * 0.03, ease: 'easeOut' }}
                className="pointer-events-none absolute text-lg"
              >
                {['✨', '🪙', '💫', '⭐'][i % 4]}
              </motion.span>
            ))}
          </div>

          <DialogTitle className="text-xl">Purchase complete!</DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-semibold text-foreground">{item.name}</span>
            {' '}is now in your locker
            {isConsumable ? ' — activate it whenever you\'re ready.' : '.'}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0 mt-2">
          {canEquip && (
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={onEquip}
              disabled={isEquipping}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {isEquipping ? 'Equipping…' : 'Equip now'}
            </Button>
          )}
          <Button
            variant={canEquip ? 'outline' : 'default'}
            className="w-full"
            onClick={onLocker}
          >
            <Package className="h-4 w-4 mr-2" />
            {canEquip ? 'Keep in locker' : 'Got it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
