

# Major VYBE Platform Fix & Enhancement Plan

This is a large set of changes spanning 13+ areas. Here's the plan broken into prioritized work streams.

---

## Stream 1: Theme Persistence Across Devices
**Problem:** User's VYBE theme doesn't follow them across devices/sessions.
**Fix:**
- The theme is already saved to `user_themes` table in the database
- Ensure `useApplyUserTheme` loads and applies the saved theme on every login/session restore
- Verify the theme query runs on auth state change so any device picks up the saved theme immediately

---

## Stream 2: Tracking Consent — Only After Auth
**Problem:** Tracking consent dialog shows before the user has an account.
**Fix:**
- Update `TrackingConsentDialog.tsx`: Remove the fallback that shows the dialog when not logged in (lines 48-49)
- Only show the dialog when `profile?.id` exists AND no consent is stored in DB
- This ensures no tracking/personalization/ads until account creation

---

## Stream 3: Music VYBE Quiz Revamp
**Problem:** Quiz is shallow — only 3 questions, results aren't saved or used.
**Fix:**
- Expand to 7-8 questions with deeper personality mapping
- Save results to a `music_personality` column on profiles (or a dedicated table)
- Display the music personality on the user's profile card
- Use the result to influence music recommendations and VYBE DNA creative score

---

## Stream 4: Profile Background — Fixed Position (No Scroll)
**Problem:** Background theme moves when scrolling on profile page.
**Fix:**
- In `Profile.tsx` line 212: The theme container is already `fixed inset-0` — verify the content wrapper at z-[4] scrolls independently
- Add `overflow-y-auto` and `h-screen` to the content container so only content scrolls, not the background
- Wrap the main content in a scrollable div while keeping the background layer truly fixed

---

## Stream 5: Profile Background — Preloaded/Cached
**Problem:** Background loads visibly when visiting a profile.
**Fix:**
- In `useProfileByUsername`, prefetch the `equipped_profile_theme` data
- Use `<link rel="preload">` for theme images when profile data is available
- Apply the theme image via CSS `background-image` on the fixed container so it renders immediately from cache

---

## Stream 6: VYBE DNA Revamp — Make It Beneficial
**Problem:** DNA is visual-only with no tangible benefit.
**Fix:**
- Add DNA-driven perks: archetype-based daily token bonus, compatibility matching boost, personalized challenge suggestions
- Show a "DNA Perks" card on the DNA page listing active benefits
- Fix scrolling by ensuring the page container has proper `overflow-y-auto` and `pb-24` (already has pb-24)
- Connect DNA archetype to feed personalization weight

---

## Stream 7: Call Rejoin — Camera & Full End
**Problem:** Camera doesn't work on rejoin; calls don't fully end when both leave.
**Fix:**
- In `GlobalCallOverlay.tsx` / call components: on rejoin, re-initialize media tracks (getUserMedia) fresh
- Add a `useEffect` cleanup that destroys all tracks on unmount
- Implement server-side call state: when both participants leave, auto-end the call via the linger timeout (already 1hr — reduce to 30s for 1:1 calls or check participant count)

---

## Stream 8: Bug Bounty XP — Reduce to 150
**Problem:** Bug report gives 500 XP, should be 150.
**Fix:**
- `src/hooks/useBugBountyDetector.ts` line 348: Change `p_xp_amount: 500` → `p_xp_amount: 150`
- Update toast message from "+500 XP" to "+150 XP"

---

## Stream 9: AI VYBE Designer — Full Control + Revert
**Problem:** Designer only changes colors/theme, not layout or UI structure.
**Fix:**
- Expand the AI prompt system to generate layout configs (widget order, nav order, section visibility)
- Save the complete UI state before applying changes as a "snapshot" in `user_preferences`
- Add a confirmation step: "Preview these changes?" before applying
- Add a "Revert to Last Save" button that restores the snapshot
- Store layout configs in the existing `user_preferences` table under a `ui_snapshot` key

---

## Stream 10: Spaces → VYBE Hubs (Complete Rename)
**Problem:** "Spaces" button should navigate to Communities, renamed to "Hubs."
**Fix:**
- Already renamed header in `VYBESpaces.tsx` — now also rename in:
  - `Sidebar.tsx`: "Spaces" → "Hubs"
  - `DiscoveryCards.tsx`: "Spaces" → "Hubs"
  - `usePageTitle.ts`: Update title
  - `routePreloader.ts`: Keep routes but update labels
  - Navigate `/spaces` to the Community page or merge the two

---

## Stream 11: Token Shop — Purchases Work + Locker Integration
**Problem:** Purchased items don't appear in locker or actually function.
**Fix:**
- Create a `marketplace_purchases` query in the Locker to show a "Purchased" tab
- Map marketplace item IDs to actual cosmetic effects (frames, themes, etc.)
- When a boost is purchased, apply it via an RPC (e.g., `activate_xp_boost`)
- Add a "Shop" sub-tab inside the Profile Locker alongside existing categories

---

## Stream 12: VybePass / Challenges Scrolling Fix
**Problem:** Level/battle pass scrolling is janky, doesn't work when touching the middle.
**Fix:**
- Audit the VybePass/challenges components for nested scroll containers
- Replace any `overflow-hidden` parents that block touch scroll with proper `overflow-y-auto`
- Ensure touch-action CSS is set correctly for mobile

---

## Stream 13: Premium via Stripe — Real Payments
**Problem:** Premium purchases go through RevenueCat which may not be fully configured.
**Fix:**
- Add a Stripe checkout fallback: create `create-premium-checkout` edge function
- On successful payment, insert/update the user's premium status in `gifted_premium` or a new `premium_subscriptions` table
- Use `check-subscription` edge function to verify premium on login
- Premium status persists in DB so it works across devices
- Keep RevenueCat as primary but add Stripe as web fallback

---

## Implementation Priority Order
1. **Bug Bounty XP fix** (1 line change)
2. **Tracking consent auth-gate** (small change)
3. **Profile background fixed scroll** (CSS fix)
4. **Spaces → Hubs rename** (text changes)
5. **Theme persistence across devices** (verify existing logic)
6. **VYBE DNA scrolling + perks**
7. **Token shop → Locker integration**
8. **VybePass scrolling fix**
9. **Music quiz revamp**
10. **Call rejoin + auto-end**
11. **AI Designer full control + revert**
12. **Background preloading**
13. **Stripe premium payments**

---

## Technical Notes
- Database migrations needed for: music personality storage, marketplace purchase → locker mapping, premium subscriptions table, UI snapshot storage
- Edge functions needed for: `create-premium-checkout`, `check-subscription`
- Stripe connector must be enabled before implementing payment flow
- All theme/cosmetic changes use existing `user_themes` and `battle_pass_tiers` tables

