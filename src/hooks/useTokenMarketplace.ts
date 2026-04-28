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
}

export const MARKETPLACE_ITEMS: MarketplaceItem[] = [
  // Cosmetics
  { id: 'theme_neon', name: 'Neon Nights Theme', description: 'Unlock a cyberpunk neon theme', cost: 200, category: 'cosmetic', icon: '🌆' },
  { id: 'theme_ocean', name: 'Deep Ocean Theme', description: 'Cool deep-sea vibes', cost: 200, category: 'cosmetic', icon: '🌊' },
  { id: 'avatar_frame_gold', name: 'Gold Avatar Frame', description: 'A shimmering gold frame for your avatar', cost: 350, category: 'cosmetic', icon: '🖼️' },
  { id: 'avatar_frame_fire', name: 'Fire Avatar Frame', description: 'Blazing fire effect around your avatar', cost: 400, category: 'cosmetic', icon: '🔥' },
  // Boosts
  { id: 'streak_shield', name: 'Streak Shield', description: 'Protect your streak for 24h', cost: 30, category: 'boost', icon: '🛡️' },
  { id: 'xp_boost_2x', name: '2x XP Boost (1hr)', description: 'Double XP for the next hour', cost: 50, category: 'boost', icon: '⚡' },
  { id: 'visibility_boost', name: 'Visibility Boost', description: 'Boost your next post visibility', cost: 75, category: 'boost', icon: '📈' },
  // Feature Unlocks
  { id: 'extra_theme_slot', name: 'Extra Theme Slot', description: 'Save an additional custom theme', cost: 150, category: 'feature', icon: '🎨' },
  { id: 'custom_emoji_pack', name: 'Custom Emoji Pack', description: 'Unlock exclusive reaction emojis', cost: 250, category: 'feature', icon: '😎' },
  // Premium-only Unlocks
  { id: 'dna_aurora', name: 'Aurora DNA Pattern', description: 'Exclusive aurora borealis DNA pattern', cost: 500, category: 'unlock', icon: '🌌', premiumOnly: true },
  { id: 'dna_galaxy', name: 'Galaxy DNA Pattern', description: 'Galactic swirl DNA pattern', cost: 500, category: 'unlock', icon: '🪐', premiumOnly: true },
  { id: 'diamond_frame', name: 'Diamond Avatar Frame', description: 'Ultra-rare diamond frame', cost: 1000, category: 'unlock', icon: '💎', premiumOnly: true },
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
    let filtered = MARKETPLACE_ITEMS.filter(item => !item.premiumOnly || isPremium);
    if (filterCategory) filtered = filtered.filter(i => i.category === filterCategory);
    return filtered;
  }, [isPremium, filterCategory]);

  const canAfford = (cost: number) => balance >= cost;

  return { items, balance, canAfford, isPremium };
}
