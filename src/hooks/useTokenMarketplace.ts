import { useMemo } from 'react';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useTokenMarketplaceState } from './useTokenMarketplaceState';

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: 'cosmetic' | 'feature' | 'boost' | 'unlock';
  icon: string;
  premiumOnly?: boolean; available: boolean;
  /**
   * 'permanent' = applied on purchase (themes, frames). Owning it = having it.
   * 'consumable' = grants a one-shot perk that must be Activated from inventory.
   */
  kind: 'permanent' | 'consumable';
  /** Short blurb shown on the card explaining what it actually does. */
  perk: string;
}

export const CATEGORY_LABELS: Record<MarketplaceItem['category'], { label: string; icon: string }> = {
  cosmetic: { label: 'Cosmetics', icon: '✨' },
  boost: { label: 'Boosts', icon: '⚡' },
  feature: { label: 'Features', icon: '🔓' },
  unlock: { label: 'Exclusives', icon: '👑' },
};

export function useTokenMarketplace(filterCategory?: MarketplaceItem['category']) {
  const { hasPremiumCosmetics: isPremium } = usePremiumStatus();
  const state = useTokenMarketplaceState();
  const items = useMemo(() => (state.data?.catalog || []).filter(item => !filterCategory || item.category === filterCategory), [state.data?.catalog, filterCategory]);
  const ready = state.isSuccess && !state.isError;
  return { ...state, items, balance: ready ? state.data?.wallet.balance : undefined,
    canAfford: (cost: number) => ready && !!state.data && state.data.wallet.balance >= cost,
    inventory: ready ? state.data?.inventory || [] : [], legacyReview: state.data?.legacy_review ?? false, isPremium, ready };
}
