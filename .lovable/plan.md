## Goals

1. Make everything free — every user is treated as Premium (no paywalls, no upgrade buttons), but **hide all premium-only cosmetics** so they can be saved for the future "VYBE+" launch.
2. Fix the post card's gradient outline so it looks cleaner (the bright neon strip at the very top of every post currently looks raw).
3. Fix the bright neon light running across the very top of the bottom nav (same `seamless-gradient-strip` hairline showing too hot).

---

## 1. Make everything free + hide premium cosmetics

The cleanest way to flip the whole app to "free" without ripping out 80+ files is to neutralize the gate at its source: `src/hooks/usePremiumStatus.ts`.

**Approach — split the concept into two flags:**

- `isPremium` → always `true` (so paywalls, ads gating, upload limits, message scheduling, secret chats, etc. all unlock).
- `hasPremiumCosmetics` → always `false` (so animated borders, exclusive reactions, premium-only profile effects, premium meme-ban items, premium-only stickers, and the “VYBE+ crown” badge stay hidden).

Update `usePremiumStatus` to return both flags. Owners and gifted users keep `hasPremiumCosmetics = true` so you (owner) can still preview/test. Everyone else gets full functional access but no cosmetic flair.

**Cosmetic call sites to switch from `isPremium` → `hasPremiumCosmetics`:**

- `src/components/badges/StyledDisplayName.tsx`, `src/components/ui/StyledUsername.tsx`, `src/components/badges/FounderBadge.tsx` — premium name styling / crown.
- `src/components/profile/ProfileHeroCard.tsx` — animated profile border / premium hero treatment.
- `src/components/stories/StoryRing.tsx` — premium animated story ring.
- `src/components/posts/ShortCard.tsx`, `src/components/posts/PostCard.tsx` — any premium-only visual flourish.
- `src/components/premium/PremiumMemeBanItems.tsx` — keep gated.
- `src/components/camera/ARFilterPicker.tsx` — premium AR filters stay locked visually but if any are functional-only, leave open.
- `src/components/chat/Toybox.tsx` / `ToyboxModal.tsx` — premium-only toybox cosmetics.
- `src/components/settings/ThemesSection.tsx`, `useCustomTheme.ts`, `useApplyThemeFonts.ts`, `useCustomSounds.ts` — premium themes/fonts/sounds: keep cosmetic-locked.

Anything that is a *capability* (uploads, scheduling, secret chats, meme-ban powers, ad-free) stays on `isPremium` and is therefore free for everyone.

**Paywall / upgrade UI to remove from view (do not delete files yet — just hide):**

- `src/components/premium/UpgradeButton.tsx` → render `null`.
- `src/components/premium/PaywallSheet.tsx` → render `null` (so any leftover trigger is a no-op).
- `src/components/premium/PremiumGiftChecker.tsx` → render `null` (no gift popups).
- `src/components/premium/GiftPremiumButton.tsx` → render `null` for non-owners (owner can still gift cosmetic access for testing).
- `src/components/premium/PremiumActivationAnimation.tsx` → never trigger (already opt-in).
- Any "Upgrade" / "Go Premium" entry points in:
  - `src/components/layout/Sidebar.tsx`
  - `src/components/layout/MobileHeader.tsx`
  - `src/components/layout/DesktopLeftSidebar.tsx`
  - `src/components/profile/ProfileHeroCard.tsx`
  - `src/pages/Profile.tsx`, `src/pages/InviteFriends.tsx`, `src/pages/Contact.tsx`, `src/pages/Settings.tsx` (subscription tab)

**Settings → Subscription tab**: replace `SubscriptionSection` content with a small placeholder card: "VYBE+ is coming soon. For now, every feature is free — enjoy." Keep `CustomerCenter` mounted for users who already have a Stripe/RevenueCat sub so they can still manage/cancel it.

**Routes**: keep `/premium-success` route working (harmless), but remove the link from any nav.

**Ads**: `useShowAds.ts` already returns `false` when `isPremium` is true — so flipping `isPremium` to always-true automatically makes the whole app ad-free, satisfying "ad-free for everyone for now".

**Backend / DB**: no migration needed. Existing `gifted_premium`, RevenueCat, and Stripe records stay untouched so we can re-enable VYBE+ later without data loss.

---

## 2. Fix the post gradient outline

In `src/components/posts/PostCard.tsx` around line 483–488, the post card currently has:

- a `border border-border/10` rounded card,
- a vertical 3px primary→accent bar pinned to the left edge, and
- a full-width 3px **`seamless-gradient-strip`** strip slammed at the very top.

That top strip is the bright neon line in your screenshot, and it sits flush against the avatar with no breathing room — it reads as raw/loud rather than "outline".

**Fix:**

- Drop the loud 3px top strip and the left vertical bar.
- Replace with a single, soft, full-perimeter **animated aurora outline** using a 1px gradient border (mask trick) at low opacity (~25–35%), so the entire post card gets a subtle moving VYBE aurora frame instead of a single neon line.
- Slightly increase card border radius consistency and keep the existing `bg-card/60 backdrop-blur-md` interior.

Add a new utility in `src/index.css` (e.g. `.post-aurora-outline`) that uses the existing `aurora-drift-multi` keyframes with a `padding: 1px` + `mask-composite` ring so it draws only the border, not a fill. Apply it via a thin absolutely-positioned overlay inside the `motion.article`.

Result: clean, premium, animated outline around the whole post — matching the rest of the VYBE aurora system without the harsh top bar.

---

## 3. Fix the bright neon line at the top of the bottom nav

In `src/components/layout/BottomNav.tsx` line 576–579, the same `seamless-gradient-strip` is used as a 1px hairline at `opacity-60`. On dark mode it still reads as a bright neon bar because the strip's colors are at full vibrancy.

**Fix (two small changes):**

- Lower the hairline to `opacity-25` and add a soft top mask (`maskImage: linear-gradient(to bottom, black, transparent)`) so it fades into the nav instead of cutting a sharp neon line.
- Reduce the strip's own filter saturation just for this usage by wrapping it with a class that overrides `filter: saturate(1.1) brightness(0.95)`, OR swap to a static `bg-gradient-to-r from-primary/30 via-accent/30 to-primary/30` hairline so the bottom nav top edge reads as a soft brand glow rather than an animated neon stripe.

Same softening should be reviewed for the other small uses (`GreetingWidget`, `AutoFriendDrop` pill) — but those are already small/contained, so leave them unless they look off after the fix.

---

## Files touched

- `src/hooks/usePremiumStatus.ts` — add `hasPremiumCosmetics`, force `isPremium = true` for everyone.
- `src/components/premium/UpgradeButton.tsx`, `PaywallSheet.tsx`, `PremiumGiftChecker.tsx`, `GiftPremiumButton.tsx` — return `null` (or owner-only).
- `src/components/settings/SubscriptionSection.tsx` — swap to "coming soon" card, keep CustomerCenter for legacy subs.
- Cosmetic call sites listed above — switch `isPremium` → `hasPremiumCosmetics`.
- Layout/header upgrade entry points — remove the buttons.
- `src/components/posts/PostCard.tsx` + `src/index.css` — replace top strip + left bar with `.post-aurora-outline`.
- `src/components/layout/BottomNav.tsx` — soften the top hairline.

## Out of scope

- Deleting RevenueCat / Stripe / `gifted_premium` code or DB tables (kept for future VYBE+).
- Changing edge functions (`check-premium-subscription`, etc.).
- Refunding existing subscribers — they keep cosmetic access automatically because they already pass `rcPremium` / `isGifted`.
