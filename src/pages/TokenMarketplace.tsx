import { useState, memo, useCallback } from 'react';
import { Coins, Lock, Check, ShoppingBag, Zap, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/ui/PageTransition';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useTokenMarketplace, CATEGORY_LABELS, type MarketplaceItem } from '@/hooks/useTokenMarketplace';
import { useMarketplacePurchase } from '@/hooks/useMarketplacePurchase';
import { useActivateBoost } from '@/hooks/useActiveBoosts';
import { useEquipItem } from '@/hooks/useLockerItems';
import { ActiveBoostsBanner } from '@/components/tokens/ActiveBoostsBanner';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Maps marketplace item ids -> { equip type, equip value } for permanent cosmetics
const PERMANENT_EQUIP_MAP: Record<string, { type: 'frame' | 'profile_theme'; value: string }> = {
  avatar_frame_gold: { type: 'frame', value: 'avatar_frame_gold' },
  avatar_frame_fire: { type: 'frame', value: 'avatar_frame_fire' },
  theme_neon: { type: 'profile_theme', value: 'theme_neon' },
  theme_ocean: { type: 'profile_theme', value: 'theme_ocean' },
};

// Visual preview component showing how items look on a profile
const ItemPreview = memo(({ item }: { item: MarketplaceItem }) => {
  const previewStyles: Record<string, React.ReactNode> = {
    // Themes show color swatches
    theme_neon: (
      <div className="w-full h-16 rounded-lg bg-gradient-to-br from-fuchsia-500 via-violet-600 to-cyan-400 flex items-end p-2">
        <div className="flex gap-1">
          {['bg-fuchsia-400', 'bg-violet-500', 'bg-cyan-400', 'bg-pink-500'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${c} ring-1 ring-white/20`} />
          ))}
        </div>
      </div>
    ),
    theme_ocean: (
      <div className="w-full h-16 rounded-lg bg-gradient-to-br from-blue-600 via-teal-500 to-emerald-400 flex items-end p-2">
        <div className="flex gap-1">
          {['bg-blue-400', 'bg-teal-400', 'bg-emerald-400', 'bg-sky-300'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${c} ring-1 ring-white/20`} />
          ))}
        </div>
      </div>
    ),
    // Avatar frames show a sample avatar with the frame
    avatar_frame_gold: (
      <div className="flex items-center justify-center h-16">
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 ring-[3px] ring-yellow-400/80 animate-[sunset-halo_2.4s_ease-in-out_infinite]" />
        </div>
      </div>
    ),
    avatar_frame_fire: (
      <div className="flex items-center justify-center h-16">
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-muted to-muted-foreground/20 ring-[3px] ring-orange-400/90 animate-[fire-ring-flicker_1.4s_ease-in-out_infinite]" />
          {/* Floating ember particles */}
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute left-1/2 bottom-0 w-1 h-1 rounded-full bg-orange-400 blur-[1px]"
              style={{
                animation: `fire-ember 1.6s ${i * 0.4}s ease-in infinite`,
                transform: `translateX(${(i - 1) * 6}px)`,
              }}
            />
          ))}
        </div>
      </div>
    ),
    diamond_frame: (
      <div className="flex items-center justify-center h-16">
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-muted to-muted-foreground/20" />
          <div className="absolute -inset-1 rounded-full border-[2.5px] border-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.6)]" />
        </div>
      </div>
    ),
    // DNA patterns
    dna_aurora: (
      <div className="w-full h-16 rounded-lg bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 opacity-80 flex items-center justify-center">
        <div className="text-white/80 text-xs font-medium">Aurora Pattern</div>
      </div>
    ),
    dna_galaxy: (
      <div className="w-full h-16 rounded-lg bg-gradient-to-r from-purple-600 via-indigo-500 to-blue-600 opacity-80 flex items-center justify-center">
        <div className="text-white/80 text-xs font-medium">Galaxy Pattern</div>
      </div>
    ),
    // Boosts show effect icons
    streak_shield: (
      <div className="flex items-center justify-center h-16">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-2xl">🛡️</div>
      </div>
    ),
    xp_boost_2x: (
      <div className="flex items-center justify-center h-16">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl">⚡</div>
      </div>
    ),
    visibility_boost: (
      <div className="flex items-center justify-center h-16">
        <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-2xl">📈</div>
      </div>
    ),
    extra_theme_slot: (
      <div className="flex items-center justify-center h-16">
        <div className="w-12 h-12 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-2xl">🎨</div>
      </div>
    ),
    custom_emoji_pack: (
      <div className="flex items-center justify-center h-16">
        <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-2xl">😎</div>
      </div>
    ),
  };

  return previewStyles[item.id] || (
    <div className="flex items-center justify-center h-16">
      <span className="text-3xl">{item.icon}</span>
    </div>
  );
});

// Hook to get user's purchased items
function usePurchasedItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['marketplace-purchases', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('marketplace_purchases')
        .select('item_id')
        .eq('user_id', user.id);
      if (error) throw error;
      return data.map(p => p.item_id);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });
}

const ItemCard = memo(({ item, canAfford, isPremium, onBuy, onActivate, isPurchased, isPurchasing, isActivating }: {
  item: MarketplaceItem; canAfford: boolean; isPremium: boolean;
  onBuy: (item: MarketplaceItem) => void;
  onActivate: (item: MarketplaceItem) => void;
  isPurchased: boolean; isPurchasing: boolean; isActivating: boolean;
}) => {
  const locked = item.premiumOnly && !isPremium;
  const isConsumable = item.kind === 'consumable';
  const showActivate = isPurchased && isConsumable;

  const handleClick = () => {
    if (showActivate) { onActivate(item); return; }
    if (isPurchased) { toast.info('Already owned — check your Locker'); return; }
    if (locked) { toast.error('This item is locked'); return; }
    if (!canAfford) { toast.error('Not enough tokens'); return; }
    onBuy(item);
  };

  return (
    <Card className={cn(
      "liquid-glass border-white/10 overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-[0.97]",
      locked && "opacity-60",
      isPurchased && !showActivate && "ring-1 ring-primary/30",
      showActivate && "ring-1 ring-amber-400/50"
    )}>
      <CardContent className="p-3 flex flex-col items-center text-center gap-1.5">
        <div className="w-full">
          <ItemPreview item={item} />
        </div>

        <h3 className="font-semibold text-xs text-foreground leading-tight">{item.name}</h3>
        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">{item.description}</p>
        <p className="text-[9px] text-primary/80 font-medium leading-tight line-clamp-1">{item.perk}</p>

        <div className="flex items-center gap-1 text-amber-500 font-bold text-xs mt-0.5">
          <Coins className="h-3 w-3" />
          {item.cost}
        </div>

        <Button
          size="sm"
          onClick={handleClick}
          disabled={isPurchasing || isActivating || (isPurchased && !isConsumable) || (!isPurchased && !canAfford && !locked)}
          className={cn(
            "w-full mt-0.5 text-[11px] h-7",
            showActivate
              ? "bg-amber-500 text-black hover:bg-amber-400"
              : isPurchased
                ? "bg-primary/10 text-primary border border-primary/20"
                : locked
                  ? "bg-muted text-muted-foreground"
                  : canAfford
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted/50 text-muted-foreground"
          )}
        >
          {showActivate ? (
            isActivating ? 'Activating…' : <><Zap className="h-3 w-3 mr-1" /> Activate</>
          ) : isPurchased ? (
            <><Check className="h-3 w-3 mr-1" /> Owned</>
          ) : locked ? (
            <><Lock className="h-3 w-3 mr-1" /> PRO Only</>
          ) : canAfford ? (
            isPurchasing ? 'Buying...' : 'Buy'
          ) : 'Not enough'}
        </Button>
      </CardContent>
    </Card>
  );
});

export default function TokenMarketplace() {
  const [tab, setTab] = useState<string>('all');
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);
  const filterCat = tab === 'all' ? undefined : tab as MarketplaceItem['category'];
  const { items, balance, canAfford, isPremium } = useTokenMarketplace(filterCat);
  const purchase = useMarketplacePurchase();
  const activate = useActivateBoost();
  const equip = useEquipItem();
  const { data: purchasedIds = [] } = usePurchasedItems();

  const handleBuy = useCallback((item: MarketplaceItem) => {
    purchase.mutate({ itemId: item.id, cost: item.cost, name: item.name }, {
      onSuccess: async () => {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);

        // Auto-equip permanent cosmetics so the user instantly sees what they bought
        const equipSpec = PERMANENT_EQUIP_MAP[item.id];
        if (equipSpec) {
          try {
            await equip.mutateAsync(equipSpec);
            toast.success(`${item.name} equipped!`);
          } catch {
            toast.info(`${item.name} added to your locker`);
          }
        }
      },
    });
  }, [purchase, equip]);

  const handleActivate = useCallback((item: MarketplaceItem) => {
    // Show the spinning roulette animation for the roulette pack
    if (item.id === 'roulette_pack') {
      setShowRoulette(true);
    }
    activate.mutate({ itemId: item.id, name: item.name }, {
      onSettled: () => {
        if (item.id === 'roulette_pack') {
          setTimeout(() => setShowRoulette(false), 2400);
        }
      },
    });
  }, [activate]);

  return (
    <AppLayout>
      <PageTransition>
        {/* Confetti overlay */}
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

        {/* Roulette spin overlay */}
        <AnimatePresence>
          {showRoulette && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="relative flex flex-col items-center gap-4"
              >
                <div className="relative h-44 w-44">
                  {/* Outer glow */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-fuchsia-500 to-amber-400 blur-2xl opacity-60" />
                  {/* Spinning roulette */}
                  <motion.div
                    animate={{ rotate: [0, 1440] }}
                    transition={{ duration: 2.2, ease: [0.16, 0.9, 0.3, 1] }}
                    className="absolute inset-0 rounded-full border-[6px] border-foreground/10"
                    style={{
                      background:
                        'conic-gradient(from 0deg, #ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #8b5cf6, #ec4899, #ef4444)',
                    }}
                  />
                  {/* Center hub */}
                  <div className="absolute inset-1/3 rounded-full bg-card border border-white/10 flex items-center justify-center text-3xl">
                    🎰
                  </div>
                  {/* Pointer */}
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[10px] border-r-[10px] border-b-[16px] border-l-transparent border-r-transparent border-b-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                </div>
                <div className="text-center">
                  <p className="text-base font-bold text-foreground">+5 Roulette Spins!</p>
                  <p className="text-xs text-muted-foreground">Added to your VYBE Roulette balance</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <ShoppingBag className="h-6 w-6" />
                Token Shop
              </h1>
              <p className="text-xs text-muted-foreground mt-1">Spend tokens on cosmetics, boosts & exclusives</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30">
              <Coins className="h-4 w-4 text-amber-500" />
              <span className="font-bold text-amber-500">{balance}</span>
            </div>
          </div>

          <ActiveBoostsBanner />
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
                    onActivate={handleActivate}
                    isPurchased={purchasedIds.includes(item.id)}
                    isPurchasing={purchase.isPending}
                    isActivating={activate.isPending}
                  />
                ))}

                {/* "More coming soon" placeholder cards */}
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card
                    key={`soon-${i}`}
                    className="liquid-glass border-dashed border-white/10 overflow-hidden opacity-70"
                  >
                    <CardContent className="p-3 flex flex-col items-center text-center gap-1.5 min-h-[180px] justify-center">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Sparkles className="h-6 w-6 text-primary animate-pulse" />
                      </div>
                      <h3 className="font-semibold text-xs text-foreground leading-tight">More coming soon</h3>
                      <p className="text-[10px] text-muted-foreground leading-snug">
                        New cosmetics & boosts dropping every season
                      </p>
                    </CardContent>
                  </Card>
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
