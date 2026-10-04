import { useState, memo } from 'react';
import { Coins, Check, ShoppingBag, Zap } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { PageTransition } from '@/components/ui/PageTransition';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import { useTokenMarketplace, CATEGORY_LABELS, type MarketplaceItem } from '@/hooks/useTokenMarketplace';
import { useMarketplacePurchase } from '@/hooks/useMarketplacePurchase';
import { useActivateBoost } from '@/hooks/useActiveBoosts';
import { useEquipItem } from '@/hooks/useLockerItems';
import { ActiveBoostsBanner } from '@/components/tokens/ActiveBoostsBanner';
import { PurchaseSuccessModal } from '@/components/tokens/PurchaseSuccessModal';
import { MARKETPLACE_EQUIP_MAP } from '@/lib/marketplaceEquip';
import { THEME_GRADIENTS } from '@/lib/cosmeticConstants';
import { useAuth } from '@/lib/auth';


import { tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';
import { toast } from 'sonner';

// Maps marketplace item ids -> { equip type, equip value } for permanent cosmetics
const PERMANENT_EQUIP_MAP = MARKETPLACE_EQUIP_MAP;

// Visual preview component showing how items look on a profile
const ItemPreview = memo(({ item }: { item: MarketplaceItem }) => {
  const previewStyles: Record<string, React.ReactNode> = {
    // Themes show color swatches
    theme_neon: (
      <div className="w-full h-16 rounded-lg flex items-end p-2" style={{ background: THEME_GRADIENTS.theme_neon }}>
        <div className="flex gap-1">
          {['bg-fuchsia-400', 'bg-violet-500', 'bg-cyan-400', 'bg-pink-500'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${c} ring-1 ring-white/20`} />
          ))}
        </div>
      </div>
    ),
    theme_ocean: (
      <div className="w-full h-16 rounded-lg flex items-end p-2" style={{ background: THEME_GRADIENTS.theme_ocean }}>
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

const ItemCard = memo(({ item, quantity, canAfford, busy, onBuy, onActivate, onEquip }: {
  item: MarketplaceItem; quantity: number; canAfford: boolean; busy: boolean;
  onBuy: (item: MarketplaceItem) => void; onActivate: (item: MarketplaceItem) => void; onEquip: (item: MarketplaceItem) => void;
}) => {
  const permanentOwned = item.kind === 'permanent' && quantity > 0;
  return <Card className="border-border/60 overflow-hidden"><CardContent className="p-4 space-y-3 text-center">
    <ItemPreview item={item} />
    <h2 className="font-semibold text-sm">{item.name}</h2>
    <p className="text-xs text-muted-foreground">{item.description}</p>
    <p className="text-xs text-primary">{item.perk}</p>
    {item.kind === 'consumable' && <p className="text-xs" aria-label={`${item.name} quantity`}>{quantity} ready to use</p>}
    {!item.available ? <Button disabled className="w-full">Unavailable</Button> : permanentOwned ?
      <Button className="w-full" disabled={busy || !PERMANENT_EQUIP_MAP[item.id]} onClick={() => onEquip(item)}><Check className="h-4 w-4 mr-1" />Owned · Equip</Button> :
      <Button className="w-full" disabled={busy || !canAfford} onClick={() => onBuy(item)} aria-label={`Buy ${item.name} for ${item.cost} tokens`}>
        <Coins className="h-4 w-4 mr-1" />{item.cost} · {busy ? 'Please wait…' : canAfford ? 'Buy' : 'Not enough tokens'}
      </Button>}
    {item.kind === 'consumable' && quantity > 0 && item.available &&
      <Button variant="outline" className="w-full" disabled={busy} onClick={() => onActivate(item)} aria-label={`Activate ${item.name}`}><Zap className="h-4 w-4 mr-1" />Activate one</Button>}
  </CardContent></Card>;
});

function TokenMarketplaceSession() {
  const [tab, setTab] = useState<string>('all');
  const [purchaseSuccessItem, setPurchaseSuccessItem] = useState<MarketplaceItem | null>(null);
  const filter = tab === 'all' ? undefined : tab as MarketplaceItem['category'];
  const state = useTokenMarketplace(filter);
  const purchase = useMarketplacePurchase();
  const activate = useActivateBoost();
  const equip = useEquipItem();
  const busy = purchase.isPending || activate.isPending || equip.isPending || !state.ready;
  const buy = (item: MarketplaceItem) => {
    if (busy || !item.available) return;
    purchase.mutate({ itemId: item.id, cost: item.cost, name: item.name }, { onSuccess: () => setPurchaseSuccessItem(item) });
  };
  const equipItem = (item: MarketplaceItem) => {
    const spec = PERMANENT_EQUIP_MAP[item.id];
    if (!spec || equip.isPending) return;
    equip.mutate(spec, { onSuccess: () => { toast.success(`${item.name} equipped on your profile`); setPurchaseSuccessItem(null); } });
  };
  return <AppLayout><PageTransition>
    <PurchaseSuccessModal item={purchaseSuccessItem} open={!!purchaseSuccessItem}
      onOpenChange={open => { if (!open) setPurchaseSuccessItem(null); }}
      onEquip={() => { if (purchaseSuccessItem) equipItem(purchaseSuccessItem); }}
      onLocker={() => setPurchaseSuccessItem(null)} isEquipping={equip.isPending} />
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="h-6 w-6" />Token Shop</h1><p className="text-xs text-muted-foreground mt-1">Profile cosmetics and verified reward boosts</p></div>
        <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex gap-2 items-center"><Coins className="h-4 w-4 text-amber-500" /><span aria-label="Token balance">{state.balance === undefined ? '—' : state.balance.toLocaleString()}</span></div>
      </div>
      {state.legacyReview && <p role="status" className="rounded-xl border p-3 text-sm">Your earlier token and purchase history is retained for review. It is not included in the verified spendable balance or inventory yet.</p>}
      {state.isLoading ? <p role="status">Loading your wallet and shop…</p> : state.isError ?
        <div role="alert" className="rounded-xl border p-4 space-y-3"><p>The token shop is unavailable. Your balance and purchases could not be verified.</p><Button onClick={() => void state.refetch()}>Try again</Button></div> :
        <>
          <ActiveBoostsBanner />
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full"><TabsTrigger value="all" className="flex-1">All</TabsTrigger>{Object.entries(CATEGORY_LABELS).map(([key, { label }]) => <TabsTrigger key={key} value={key} className="flex-1">{label}</TabsTrigger>)}</TabsList>
            <TabsContent value={tab} className="mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{state.items.map(item => <ItemCard key={item.id} item={item}
                quantity={state.inventory.find(owned => owned.item_id === item.id)?.quantity || 0}
                canAfford={state.canAfford(item.cost)} busy={busy} onBuy={buy} onEquip={equipItem}
                onActivate={selected => { if (!busy && selected.available) activate.mutate({ itemId: selected.id, name: selected.name }); }} />)}</div>
              {state.items.length === 0 && <p className="py-10 text-center text-muted-foreground">No items in this category.</p>}
            </TabsContent>
          </Tabs>
        </>}
    </div>
  </PageTransition></AppLayout>;
}

export default function TokenMarketplace() {
  const uid = useAuth().user?.id;
  return <TokenMarketplaceSession key={`${uid || 'signed-out'}:${tokenAccountSnapshot().epoch}`} />;
}
