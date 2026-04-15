

## Friend Link Compact Redesign + Premium System Overhaul + Live Payments Fix

---

### 1. Friend Link — Compact Mobile Redesign

**Problem**: The current `FriendDrop.tsx` is a 1139-line component with a "cyber hacker" aesthetic (font-mono, TERMINATE, SIGNAL ACQUIRED, etc.) that doesn't fit a clean social app. It uses a Dialog that's oversized on phones with a 2-column grid layout that's cramped on small screens. `AutoFriendDrop.tsx` (511 lines) is a second implementation with cleaner styling but duplicated logic.

**Redesign**: Replace the cyber/hacker theme with a clean, compact bottom sheet design:
- **Single-column layout**: QR code centered at top, scanner button below, share/copy row as compact pills
- **Remove all cyber language**: No more "SIGNAL ACQUIRED", "TERMINATE", "DECRYPTING IDENTITY", "SCAN TARGET". Replace with clean, friendly copy
- **Compact found/success states**: Inline card instead of full-page takeover
- **Clean header**: Simple "Add Friend" title with X close, no cyber grid overlays
- **Sheet height**: `max-h-[75vh]` instead of full dialog, bottom sheet style on mobile
- **Remove duplicate**: Consolidate `AutoFriendDrop.tsx` trigger into `FriendDrop.tsx`

**Files**: `src/components/friends/FriendDrop.tsx`, `src/components/friends/AutoFriendDrop.tsx`

---

### 2. Premium Feature Audit — Free vs Premium Rebalancing

**Problem**: The paywall lists features like voice messages, unsending, vanish mode as premium-only, but these are basic messaging features users expect for free. The perk list is inflated with features that don't exist yet.

**New Free vs Premium split**:

**FREE (basic social features)**:
- Voice messages in DMs
- Unsend/delete messages
- Basic reactions & emojis
- Standard file uploads (20MB)
- Basic themes & colors
- Read receipts (always on)
- Standard profile customization
- Pin 1 post to profile
- Ad-supported experience

**PREMIUM (enhancement layer)**:
- Ad-free experience
- Animated profile borders & name effects
- Profile visitor tracker (see who viewed you)
- Custom emoji reactions (upload your own)
- Chat effects (confetti, screen-shake)
- Profile music (song on your profile)
- 50MB file uploads + high-res media
- Read receipt control (toggle per convo)
- Message scheduling
- Post analytics (views, reach, engagement)
- Post scheduling & priority in Explore
- Longer clips (3min vs 1min)
- Premium font packs & unlimited AI themes
- Daily loot box & rare reaction packs
- Profile pet
- Gift Premium to friends
- Early access to new features
- OG Flex Badge
- Custom status badges
- Animated banners (GIF/video)

**Files**: `src/components/premium/PaywallSheet.tsx`, `src/components/settings/PremiumPerkActions.tsx`

---

### 3. PaywallSheet Redesign — Clean, Accurate Listing

**Redesign the paywall from scratch**:
- **Hero section**: Gradient crown with "VYBE Pro" branding, clean sans-serif typography (not the current busy icon layout)
- **Feature list**: Simple scrollable list with checkmark icons grouped into 3 clear sections (Social, Creator, Style) instead of 6 collapsible categories
- **Before/After visual**: Compact 2-column comparison showing Free vs Pro for key features
- **Pricing**: Clean price cards at bottom with monthly/annual toggle
- **CTA**: Single prominent gradient button

**Files**: `src/components/premium/PaywallSheet.tsx`, `src/components/settings/PremiumPerkActions.tsx`

---

### 4. Fix "Test Purchase" on Live App

**Problem**: The `create-premium-checkout` edge function uses `resolveStripeKey()` which falls back to `app_secrets` table. The key stored is likely a `sk_test_` key, causing test mode on the live domain.

**Fix**:
- Update `create-premium-checkout/index.ts` to validate the resolved key and log clearly when running in test vs live mode (it already does this via `validateStripeKey`)
- The actual fix is ensuring the correct `sk_live_` key is stored. Will check if `STRIPE_SECRET_KEY` env secret is set to a live key
- Add a visible indicator in the PaywallSheet when in test mode so the user knows ("Test Mode" badge)
- On the live domain (`vybehub.app`), if the key resolves to test mode, show a warning toast instead of silently proceeding

**Files**: `supabase/functions/create-premium-checkout/index.ts`, `src/components/premium/PaywallSheet.tsx`

---

### Technical Details

**Files modified** (6 files):
- `src/components/friends/FriendDrop.tsx` — Complete compact redesign, remove cyber theme
- `src/components/friends/AutoFriendDrop.tsx` — Simplify to just the trigger pill, delegate to FriendDrop
- `src/components/premium/PaywallSheet.tsx` — Full redesign with accurate free/premium split
- `src/components/settings/PremiumPerkActions.tsx` — Updated comparison table matching new premium tiers
- `supabase/functions/create-premium-checkout/index.ts` — Add live domain validation warning

**No database changes needed.**

**Secret check needed**: Will verify if `STRIPE_SECRET_KEY` is set to a live key via the secrets tool.

