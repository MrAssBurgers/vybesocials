/** Maps marketplace item ids → locker equip fields for permanent cosmetics. */
export const MARKETPLACE_EQUIP_MAP: Record<
  string,
  { type: 'frame' | 'profile_theme'; value: string }
> = {
  avatar_frame_gold: { type: 'frame', value: 'avatar_frame_gold' },
  avatar_frame_fire: { type: 'frame', value: 'avatar_frame_fire' },
  theme_neon: { type: 'profile_theme', value: 'theme_neon' },
  theme_ocean: { type: 'profile_theme', value: 'theme_ocean' },
};

export function isEquippableMarketplaceItem(itemId: string): boolean {
  return itemId in MARKETPLACE_EQUIP_MAP;
}
