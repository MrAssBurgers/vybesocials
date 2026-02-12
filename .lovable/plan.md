
# Locker Overhaul: Full Cosmetics Hub

## What's Changing
The Locker tab on your profile gets completely rebuilt into a clean, categorized cosmetics manager. The Themes tab is removed. Everything is organized into clear sections where you can equip/unequip items that actually show on your profile for everyone to see.

## Categories in the New Locker

1. **Badges** -- Pin up to 3 badges to display on your profile. Toggle which ones show. Earned badges are interactive, locked ones are grayed out.

2. **Titles** -- Equip a title that shows under your name (e.g., "Newcomer", "Rising Star", "Legend", "VYBE God"). Earned from leveling up.

3. **Profile Effects** -- Equip name effects like Sparkle, Rainbow Shift, Fire Trail, Cosmic Glow. These show as animations near your username.

4. **Cosmetics** -- Equip frames/auras like Blue Glow, Purple Aura, Gold Frame, Diamond Frame that appear around your avatar.

5. **Shop** -- Coming Soon teaser (kept as-is).

## How Equipping Works
- Each category shows your unlocked items and locked items
- Tap an unlocked item to equip it (green checkmark appears)
- Tap again to unequip
- Only ONE item per category can be equipped at a time
- Changes save instantly and are visible to everyone visiting your profile

## Technical Details

### Database Changes
- Add columns to `profiles` table:
  - `equipped_title` (text, nullable) -- the equipped title name
  - `equipped_effect` (text, nullable) -- the equipped effect name  
  - `equipped_frame` (text, nullable) -- the equipped cosmetic/frame name
- These are simple text fields storing the reward_name from `battle_pass_tiers`

### Determine Unlocked Items
- Query `user_levels` to get the user's current level
- Query `battle_pass_tiers` to get all tiers at or below that level
- Filter by `reward_type` to separate titles, effects, and cosmetics
- No new tables needed -- unlocks are derived from level

### Profile Display Updates
- **Title**: Render equipped title as a small styled tag below the username on `Profile.tsx`
- **Effect**: Apply CSS animation class to the username area (sparkle, rainbow-shift, fire-trail, cosmic-glow keyframes)
- **Frame/Cosmetic**: Apply a styled border/glow effect around the avatar

### Component Changes
- **Rewrite `ProfileLocker.tsx`**: Remove Themes tab. Replace with scrollable single-page layout with collapsible category sections (Badges, Titles, Effects, Cosmetics, Shop)
- **Update `Profile.tsx`**: Read `equipped_title`, `equipped_effect`, `equipped_frame` from profile data and render them visually
- **Badge pinning**: Wire up `is_pinned` and `pin_order` on `user_badges` table using the existing `useUpdateBadgeSettings` hook so users can choose which 3 badges display

### New Hook: `useLockerItems`
- Fetches user level + battle pass tiers to compute which titles/effects/cosmetics are unlocked
- Provides equip/unequip mutations that update the `profiles` table columns
- Invalidates profile queries so changes reflect everywhere immediately

### Files to Create
- `src/hooks/useLockerItems.ts` -- hook for fetching unlocked cosmetics and equip/unequip actions

### Files to Modify
- `src/components/profile/ProfileLocker.tsx` -- full rewrite with categorized sections
- `src/pages/Profile.tsx` -- display equipped title, effect, and frame
- Database migration to add `equipped_title`, `equipped_effect`, `equipped_frame` to profiles
