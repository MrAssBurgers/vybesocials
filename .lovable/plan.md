
# Mega Locker & VYBE Pass Overhaul

## What You'll Get
- **50 individual levels** with no gaps -- every single level from 1 to 50 unlocks something
- **Name Colors** -- new reward type that changes the color of your display name (Crimson, Ocean Blue, Emerald, Sunset Orange, Neon Pink, Ice Blue, etc.)
- **Profile Themes** -- new reward type that changes how your profile looks to visitors (like Discord profile themes -- dark mode variants, gradient backgrounds, accent color shifts)
- **Cooler Frames** -- more avatar frame options (Neon Ring, Emerald Ring, Sunset Halo, Lightning Frame, Obsidian Frame, Holographic Frame)
- **More Effects** -- additional name effects (Glitch, Neon Pulse, Shadow Flicker, Aurora Wave, Electric Surge)
- **Locker tab icon** changed to a proper locker/box icon instead of Sparkles
- **Profile effects go crazy** -- when someone visits a profile, equipped effects are visually amplified with particle-like CSS animations

## New Reward Types Added

| Type | What It Does | Example |
|------|-------------|---------|
| `name_color` | Changes display name color | "Crimson", "Ocean Blue", "Neon Pink" |
| `profile_theme` | Changes profile card appearance for visitors | "Midnight", "Sunset Vibes", "Arctic" |
| `effect` | Name animation (existing, expanded) | "Glitch", "Neon Pulse", "Aurora Wave" |
| `cosmetic` | Avatar frame (existing, expanded) | "Neon Ring", "Holographic Frame" |
| `title` | Title tag (existing, expanded) | "Trailblazer", "Icon", "Mythic" |

## All 50 Levels (every level has a reward)

Levels 1-10: Starter rewards (titles, basic colors, basic frames, basic effects)
Levels 11-20: Intermediate rewards (more colors, cooler effects, better frames)
Levels 21-30: Advanced rewards (profile themes, rare effects, premium frames)
Levels 31-40: Elite rewards (neon/holographic items, glitch effects, mythic titles)
Levels 41-50: Legendary rewards (best-in-class everything, VYBE God title at 50)

## Profile Rendering Upgrades

- **Name Colors**: Applied as inline `style={{ color }}` on the username/display name
- **Profile Themes**: Adds a gradient overlay or accent color shift to the profile header area
- **Amplified Effects**: When viewing someone's profile, effects like Sparkle show larger text-shadow pulses, Rainbow Shift cycles faster, Fire Trail gets more intense glow, Cosmic Glow adds a subtle background pulse
- **New Frames**: Each frame has unique ring color, shadow, and optional pulse animation

## Locker Tab Icon
Changed from `Sparkles` to `Package` (lucide) which looks like a locker/container

## Technical Details

### Database Changes
1. **Add columns to `profiles`**:
   - `equipped_name_color` (text, nullable) -- stores the equipped name color value
   - `equipped_profile_theme` (text, nullable) -- stores the equipped profile theme name

2. **Replace all 14 battle_pass_tiers rows** with 50 new rows spanning every level from 1-50 with no gaps. The `calculate_level_from_xp` function already derives level from tiers, so this just works.

3. **XP curve** -- smooth exponential curve so higher levels take proportionally more XP:
   - Level 1: 0 XP, Level 10: 2000 XP, Level 20: 6000 XP, Level 30: 12000 XP, Level 40: 22000 XP, Level 50: 40000 XP

### Files to Modify

- **`src/hooks/useLockerItems.ts`** -- Add `name_colors` and `profile_themes` to the LockerData interface; filter tiers by the new reward types; add equip mutations for `name_color` and `profile_theme`
- **`src/components/profile/ProfileLocker.tsx`** -- Add new sections for Name Colors and Profile Themes; change the Locker icon; add color preview swatches and theme previews in the cards
- **`src/pages/Profile.tsx`** -- Change Locker tab icon to Package; render equipped name color on display name; render equipped profile theme as header styling; amplify profile effects with more intense CSS classes
- **`src/index.css`** -- Add new keyframes for Glitch, Neon Pulse, Shadow Flicker, Aurora Wave, Electric Surge effects; add new frame animations (neon-ring-pulse, holographic-shift, lightning-flash); add profile theme background styles; amplify existing effect keyframes for profile view

### New Hook Changes (`useLockerItems.ts`)
- Interface gains `name_colors: LockerItem[]`, `profile_themes: LockerItem[]`, `equippedNameColor`, `equippedProfileTheme`
- `useEquipItem` handles 5 types now: title, effect, frame, name_color, profile_theme
- Maps to `equipped_title`, `equipped_effect`, `equipped_frame`, `equipped_name_color`, `equipped_profile_theme` columns

### Profile Rendering Logic
- Name color: `style={{ color: nameColorMap[equippedNameColor] }}` applied to StyledUsername wrapper
- Profile theme: Conditional gradient overlay div behind the profile header
- Amplified effects: Profile page uses more intense versions of the animation classes (e.g., `sparkle-name-intense` with bigger text-shadows and faster cycles)
- New frames: Each adds unique ring/shadow CSS similar to existing Blue Glow / Diamond Frame patterns
