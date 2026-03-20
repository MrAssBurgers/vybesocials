

# Comprehensive VYBE Fix & Enhancement Plan

This plan addresses all the issues raised across multiple areas of the app.

---

## 1. Fix Black Screen (Preview Crash)

**Problem**: The Vite alias config may not work consistently across all module resolution paths, causing the preview to intermittently fail.

**Fix**:
- Simplify `vite.config.ts` — remove the `previewSupabaseClientShimPlugin` middleware (it conflicts with the alias approach) and the `runtimeEnvFallbackPlugin` (redundant since `define` already handles it)
- Keep only the `define` block and the `resolve.alias` redirect from `client.ts` → `runtime-client.ts`
- This eliminates race conditions between three competing approaches

---

## 2. Token Shop — Make Purchases Functional

**Problem**: Shop items are static placeholders with emoji icons; purchases call `purchase_marketplace_item` RPC but items don't actually apply any cosmetic/boost effect.

**Changes**:
- Replace emoji-only item cards with **visual preview mockups** showing what the item looks like on a profile (avatar frame preview, theme swatch, badge icon)
- Create a `MarketplaceItemPreview` component that renders a mini profile card showing the cosmetic applied (frame around a sample avatar, theme color swatch, badge display)
- Wire purchases to the existing `locker_items` / `user_cosmetics` system so bought items appear in the Profile Locker
- Add a "Purchased ✓" state to items already owned
- For boosts (streak shield, XP boost), record the active boost with an expiry timestamp

---

## 3. Home Page Shop Button → Token Marketplace

**Problem**: The "Shop" discovery card on home navigates to `/marketplace` (Token Shop) which is correct, but user wants it to go to the locker shop.

**Fix**: Change the Shop discovery card path from `/marketplace` to `/marketplace` (it's already correct — the TokenMarketplace page IS the shop). Ensure the marketplace route works and items are purchasable.

---

## 4. Remove Loading Screen / Make Navigation Instant

**Problem**: `PageFallback` shows a spinner on every lazy route transition.

**Fix**:
- Convert high-traffic pages (Explore, Messages, Notifications, Profile, Settings, Community) from `lazy()` to eager imports
- Reduce `PageFallback` to a transparent empty `div` (no spinner) for remaining lazy routes
- This ensures clicking any main nav item opens instantly

---

## 5. Remove Floating Bell Notification Icon

**Problem**: `PushNotificationPrompt` renders as a full-screen modal with a bell icon that may appear stuck in the bottom-right corner on certain states.

**Fix**:
- In `App.tsx`, remove the `<PushNotificationPrompt />` component entirely (or gate it behind a settings opt-in instead of an automatic popup)
- This eliminates the floating bell

---

## 6. Fix Double X Buttons on Popups/Notifications

**Problem**: Some Sheet/Dialog components have both a built-in close button from Radix AND a custom X button.

**Fix**:
- Audit all Sheet/Dialog components for duplicate close buttons
- Remove custom X buttons where the Radix `SheetClose` or `DialogClose` already provides one
- Check `AIBriefSheet`, notification sheets, and profile locker sheets specifically

---

## 7. Revamp Tutorial

**Problem**: Tutorial steps reference selectors that may not exist, and descriptions are verbose.

**Fix**:
- Simplify to 6 core steps (Welcome → Feed → Create → Messages → Profile → Done)
- Each step: short title, 1-sentence description, clear visual target
- Remove menu-opening actions (they break tutorial flow)
- Add a "crucial features" summary card at the end (Shop, Communities, Daily Brief, Locker)
- Ensure all `targetSelector` values match actual DOM elements

---

## 8. Fix Daily Brief Content

**Problem**: The AI brief may return generic content instead of personalized data.

**Fix**:
- In `AIBriefSheet.tsx`, ensure the edge function call passes the user's selected interests/topics from their brief preferences
- Verify the brief data includes actual unread message counts, notification details, and activity stats (not placeholder text)
- Add fallback content if the AI response is empty

---

## 9. Add Real Progression to Progress Bars

**Problem**: XP progress bar exists but may not have real data behind it.

**Fix**:
- Ensure `useNextLevelProgress` hook returns actual XP data from the database
- Add progression tracking to all features with progress bars (battle pass, challenges)
- Wire the home page XP bar to real XP transactions

---

## 10. Profile Page Layout — XP Tracker & Customization Button

**Problem**: On other users' profiles, the XP tracker should be above the customization button, and the whole area should be compact.

**Fix**:
- In `Home.tsx`, move the Customize button **below** the XP/streak strip (swap lines 379-390 with the WelcomeHeader area)
- Make the XP strip and customize button a single compact row
- For other users' profiles, show their level/XP above the stats section

---

## 11. Community Cards — Fix Cut-off Icons & Consistent Design

**Problem**: Community card icons get cut off at `-mt-8` overlap, and the screenshot shows inconsistent styling.

**Fix**:
- In `CommunityCard.tsx` and `PublicCommunityCard.tsx`:
  - Move the icon **inside** the cover area (bottom-left, overlapping the edge) with proper `overflow-visible`
  - Increase icon size slightly and add more border
  - Standardize card height with `min-h` to prevent layout shifts
  - Use consistent gradient backgrounds with different colors per community (already done via hash)
  - Match the "Join Community" button style (rounded, bold yellow/primary as shown in screenshot)

---

## 12. Community Page — Mobile-Friendly Create/Join Buttons

**Problem**: The Join and Create buttons only show icons on mobile (`<span className="hidden sm:inline">`), making them ambiguous.

**Fix**:
- Remove the `hidden sm:inline` class so button labels ("Join" / "Create") always show on mobile
- Use compact button text that fits mobile widths

---

## Technical Details

### Files to modify:
1. `vite.config.ts` — Simplify plugins
2. `src/pages/TokenMarketplace.tsx` — Visual item previews, purchase state
3. `src/components/layout/AnimatedRoutes.tsx` — Eager-load more routes, minimal fallback
4. `src/App.tsx` — Remove PushNotificationPrompt
5. `src/components/tutorial/tutorialSteps.ts` — Simplified 6-step tutorial
6. `src/components/tutorial/TutorialOverlay.tsx` — Simplify overlay logic
7. `src/components/home/AIBriefSheet.tsx` — Fix brief data passing
8. `src/pages/Home.tsx` — Reorder XP strip and customize button
9. `src/components/community/CommunityCard.tsx` — Fix icon overlap, consistent design
10. `src/pages/Community.tsx` — Show button labels on mobile
11. `src/components/community/ServerList.tsx` — Label buttons for mobile
12. `src/pages/Profile.tsx` — Compact XP/customization area
13. Various Sheet/Dialog components — Fix double X buttons

