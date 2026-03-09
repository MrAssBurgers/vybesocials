import { useState, memo, useCallback } from 'react';
import { Coins, Crown, Lock, PartyPopper } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/ui/PageTransition';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useTokenMarketplace, CATEGORY_LABELS, type MarketplaceItem } from '@/hooks/useTokenMarketplace';
import { useMarketplacePurchase } from '@/hooks/useMarketplacePurchase';
import { toast } from 'sonner';

const ItemCard = memo(({ item, canAfford, isPremium, onBuy }: { item: MarketplaceItem; canAfford: boolean; isPremium: boolean; onBuy: (item: MarketplaceItem) => void }) => {
  const locked = item.premiumOnly && !isPremium;

  const handleBuy = () => {
    if (locked) {
      toast.error('This item requires VYBE Pro');
      return;
    }
    if (!canAfford) {
      toast.error('Not enough tokens');
      return;
    }
    onBuy(item);
  };

  return (
    <Card className={cn(
      "liquid-glass border-white/10 overflow-hidden transition-all hover:scale-[1.02]",
      locked && "opacity-60"
    )}>
      <CardContent className="p-4 flex flex-col items-center text-center gap-2">
        <span className="text-3xl">{item.icon}</span>
        <h3 className="font-semibold text-sm text-foreground leading-tight">{item.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
        <div className="flex items-center gap-1 text-amber-500 font-bold text-sm mt-1">
          <Coins className="h-3.5 w-3.5" />
          {item.cost}
        </div>
        <Button
          size="sm"
          onClick={handleBuy}
          disabled={!canAfford && !locked}
          className={cn(
            "w-full mt-1 text-xs h-8",
            locked
              ? "bg-muted text-muted-foreground"
              : canAfford
                ? "gradient-animated text-primary-foreground"
                : "bg-muted/50 text-muted-foreground"
          )}
        >
          {locked ? (
            <><Lock className="h-3 w-3 mr-1" /> PRO Only</>
          ) : canAfford ? 'Buy' : 'Not enough'}
        </Button>
      </CardContent>
    </Card>
  );
});

export default function TokenMarketplace() {
  const [tab, setTab] = useState<string>('all');
  const [showConfetti, setShowConfetti] = useState(false);
  const filterCat = tab === 'all' ? undefined : tab as MarketplaceItem['category'];
  const { items, balance, canAfford, isPremium } = useTokenMarketplace(filterCat);
  const purchase = useMarketplacePurchase();

  const handleBuy = useCallback((item: MarketplaceItem) => {
    purchase.mutate({ itemId: item.id, cost: item.cost, name: item.name }, {
      onSuccess: () => {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
      },
    });
  }, [purchase]);

  return (
    <AppLayout>
      <PageTransition>
        {/* Confetti overlay on successful purchase */}
        <AnimatePresence>
          {showConfetti && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5 }}
                className="text-6xl"
              >
                🎉
              </motion.div>
              {/* Particle burst */}
              {Array.from({ length: 12 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  animate={{
                    opacity: 0,
                    scale: 0.5,
                    x: Math.cos((i * Math.PI * 2) / 12) * 120,
                    y: Math.sin((i * Math.PI * 2) / 12) * 120,
                  }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="absolute text-2xl"
                >
                  {['✨', '🪙', '💫', '⭐'][i % 4]}
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                🛒 Token Shop
              </h1>
              <p className="text-sm text-muted-foreground mt-1">Spend your VYBE tokens on cosmetics, boosts & exclusives</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30">
              <Coins className="h-4 w-4 text-amber-500" />
              <span className="font-bold text-amber-500">{balance}</span>
            </div>
          </div>

          {!isPremium && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20">
              <Crown className="h-5 w-5 text-amber-500 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-amber-500">VYBE Pro</span> unlocks exclusive items marked with 👑
              </p>
            </div>
          )}

          {/* Category Tabs */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full h-10 p-1 bg-muted/50 rounded-xl">
              <TabsTrigger value="all" className="flex-1 rounded-lg text-xs">All</TabsTrigger>
              {Object.entries(CATEGORY_LABELS).map(([key, { label, icon }]) => (
                <TabsTrigger key={key} value={key} className="flex-1 rounded-lg text-xs">
                  {icon} {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={tab} className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {items.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    canAfford={canAfford(item.cost)}
                    isPremium={isPremium}
                    onBuy={handleBuy}
                  />
                ))}
              </div>
              {items.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-4xl mb-2">🏪</p>
                  <p className="text-sm">No items in this category</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </PageTransition>
    </AppLayout>
  );
}
