import { useMemo } from 'react';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { useTokenBalance } from '@/hooks/useVybeTokens';

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: 'cosmetic' | 'feature' | 'boost' | 'unlock';
  icon: string;
  premiumOnly?: boolean;
  /**
   * 'permanent' = applied on purchase (themes, frames). Owning it = having it.
   * 'consumable' = grants a one-shot perk that must be Activated from inventory.
   */
  kind: 'permanent' | 'consumable';
  /** Short blurb shown on the card explaining what it actually does. */
  perk: string;
}

export const MARKETPLACE_ITEMS: MarketplaceItem[] = [
  // ─── Cosmetics (permanent, auto-applied to your locker on purchase) ───
  {
    id: 'theme_neon',
    name: 'Neon Nights Theme',
    description: 'Cyberpunk neon palette for your whole app',
    perk: 'Equippable from Settings → Themes',
    cost: 200,
    category: 'cosmetic',
    icon: '🌆',
    kind: 'permanent',
  },
  {
    id: 'theme_ocean',
    name: 'Deep Ocean Theme',
    description: 'Cool deep-sea vibes across the UI',
    perk: 'Equippable from Settings → Themes',
    cost: 200,
    category: 'cosmetic',
    icon: '🌊',
    kind: 'permanent',
  },
  {
    id: 'avatar_frame_gold',
    name: 'Gold Avatar Frame',
    description: 'A shimmering gold frame around your avatar',
    perk: 'Auto-equipped on your profile',
    cost: 350,
    category: 'cosmetic',
    icon: '🖼️',
    kind: 'permanent',
  },
  {
    id: 'avatar_frame_fire',
    name: 'Fire Avatar Frame',
    description: 'Animated fire effect around your avatar',
    perk: 'Auto-equipped on your profile',
    cost: 400,
    category: 'cosmetic',
    icon: '🔥',
    kind: 'permanent',
  },

  // ─── Boosts (consumable — Activate from your inventory when you want them) ───
  {
    id: 'streak_shield',
    name: 'Streak Shield',
    description: 'Auto-saves your streak if you miss a day',
    perk: 'Active for 30 days · single use',
    cost: 60,
    category: 'boost',
    icon: '🛡️',
    kind: 'consumable',
  },
  {
    id: 'xp_boost_2x',
    name: '2× XP Boost',
    description: 'All XP earnings doubled for 1 hour',
    perk: 'Activates instantly · 60 min',
    cost: 75,
    category: 'boost',
    icon: '⚡',
    kind: 'consumable',
  },
  {
    id: 'token_boost_2x',
    name: '2× Token Boost',
    description: 'All tokens you earn are doubled for 1 hour',
    perk: 'Activates instantly · 60 min',
    cost: 100,
    category: 'boost',
    icon: '💰',
    kind: 'consumable',
  },
  {
    id: 'visibility_boost',
    name: 'Post Visibility Boost',
    description: 'Push your next post to more feeds for 24 hours',
    perk: 'Auto-applies to your next post',
    cost: 90,
    category: 'boost',
    icon: '📈',
    kind: 'consumable',
  },
  {
    id: 'roulette_pack',
    name: 'Roulette 5-Pack',
    description: '5 extra VYBE Roulette spins to find new people',
    perk: 'Activate to add 5 spins',
    cost: 50,
    category: 'feature',
    icon: '🎰',
    kind: 'consumable',
  },
];

export const CATEGORY_LABELS: Record<MarketplaceItem['category'], { label: string; icon: string }> = {
  cosmetic: { label: 'Cosmetics', icon: '✨' },
  boost: { label: 'Boosts', icon: '⚡' },
  feature: { label: 'Features', icon: '🔓' },
  unlock: { label: 'Exclusives', icon: '👑' },
};

export function useTokenMarketplace(filterCategory?: MarketplaceItem['category']) {
  const { hasPremiumCosmetics: isPremium } = usePremiumStatus();
  const { data: tokenData } = useTokenBalance();
  const balance = tokenData?.balance ?? 0;

  const items = useMemo(() => {
    let filtered = MARKETPLACE_ITEMS.filter((item) => !item.premiumOnly || isPremium);
    if (filterCategory) filtered = filtered.filter((i) => i.category === filterCategory);
    return filtered;
  }, [isPremium, filterCategory]);

  const canAfford = (cost: number) => balance >= cost;

  return { items, balance, canAfford, isPremium };
}
