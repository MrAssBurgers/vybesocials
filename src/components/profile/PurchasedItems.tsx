import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Package, ShoppingBag, Zap, Palette, Crown } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface Purchase {
  id: string;
  item_id: string;
  cost: number;
  purchased_at: string;
}

const CATEGORY_ICONS: Record<string, typeof Package> = {
  cosmetic: Palette,
  boost: Zap,
  feature: Crown,
  default: ShoppingBag,
};

function getItemCategory(itemId: string): string {
  if (itemId.includes('boost') || itemId.includes('xp') || itemId.includes('multiplier')) return 'boost';
  if (itemId.includes('frame') || itemId.includes('color') || itemId.includes('effect') || itemId.includes('theme')) return 'cosmetic';
  if (itemId.includes('premium') || itemId.includes('unlock')) return 'feature';
  return 'default';
}

function formatItemName(itemId: string): string {
  return itemId
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function PurchasedItems() {
  const { profile } = useAuth();

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['marketplace-purchases', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('marketplace_purchases')
        .select('*')
        .eq('user_id', profile.id)
        .order('purchased_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Purchase[];
    },
    enabled: !!profile?.id,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (purchases.length === 0) {
    return (
      <div className="rounded-2xl bg-card/40 p-6 text-center">
        <ShoppingBag className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
        <h3 className="text-sm font-bold text-foreground mb-1">No Purchases Yet</h3>
        <p className="text-xs text-muted-foreground">
          Items you buy from the Token Shop will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {purchases.length} item{purchases.length !== 1 ? 's' : ''} purchased
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {purchases.map((purchase, i) => {
          const category = getItemCategory(purchase.item_id);
          const Icon = CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
          return (
            <motion.div
              key={purchase.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "relative flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all",
                "border-border/30 bg-card/30 backdrop-blur-xl"
              )}
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-[10px] font-semibold text-foreground text-center leading-tight truncate w-full">
                {formatItemName(purchase.item_id)}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {format(new Date(purchase.purchased_at), 'MMM d')} · 🪙 {purchase.cost}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
