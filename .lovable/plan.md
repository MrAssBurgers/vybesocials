## Goal
Fix the bugs visible in the screen recording: Friend Link sheet sitting behind the bottom nav, flickering/animating header text, "Customize Home" pill jiggle, and an Android APK crash.

## Changes

### 1. Friend Link modal — always above the bottom nav
File: `src/components/friends/AutoFriendDrop.tsx` (lines ~305–510)
- Replace the full-screen `fixed inset-0 z-50 flex items-end` overlay with the same anchoring used by `LiquidBottomSheet`:
  - Backdrop stays full-screen at `z-[9998]`.
  - Sheet container is `fixed inset-x-0 z-[9999]` with
    `bottom: calc(5rem + env(safe-area-inset-bottom, 0px))` so it floats above the bottom nav, and `maxHeight: 85vh` with `overflow-y-auto` so the QR + scanner scroll inside the sheet instead of being clipped.
  - Drop the bottom safe-area spacer (`<div className="h-safe-area-inset-bottom" />`) — replaced by the new offset.
- Tighten internal spacing so QR + scanner fit on a 6"–6.5" Android screen without needing to scroll past the nav.

### 2. Stop the header / trending text from "freaking out"
File: `src/components/home/WelcomeHeader.tsx`
- Add `data-no-auto-contrast` to the `<h1>` containing the gradient `@username` so the global contrast guard stops repainting the bg-clip-text every frame (this is the "shifting colors" flicker on the username).
- Wrap the gradient `@username` span in `will-change-transform` removed and add `style={{ backgroundClip: 'text', WebkitBackgroundClip: 'text' }}` explicitly to avoid Android WebView re-rasterizing each paint.

File: `src/pages/Home.tsx` (Customize Home pill, ~lines 322–343)
- Remove the infinite `animate={{ scale: [1, 1.02, 1] }}` loop. Replace with a one-shot fade-in (`initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}`) so the pill stops pulsing.
- Keep the hover shimmer; remove the constant scale.

File: `src/components/home/LiveActivityTicker.tsx`
- Wrap the rotating message in `<AnimatePresence mode="wait">` with a 250ms fade so it cross-fades instead of snapping mid-frame (the snap looks like text "freaking out" on a 60Hz Android display).

File: `src/components/explore/TrendingHashtags.tsx`
- Remove the per-chip `transition={{ delay: i * 0.03 }}` stagger. Render chips statically; only animate on first mount via a single parent fade. Stops the row of `#tags` from re-staggering on each re-render of the parent feed.

### 3. Android APK crash hardening
- Wrap `<AutoFriendDrop />` in a small `<ErrorBoundary>` (using existing util in `src/lib/errorLogger.ts` / `useAutoBugReporter`) in `src/pages/Home.tsx` so a Friend Link/QR/camera failure can't crash the whole APK shell. The boundary just renders `null` and reports via `useAutoBugReporter`.
- Same boundary around `<VYBECommandBar />` (already lazy) — both touch the camera/native plugins which are the most common APK crashers.

### 4. Sanity pass
- Build, then re-test on the live preview at the same Android viewport (360×800) used in the recording, and verify:
  - Friend Link sheet's bottom edge is fully visible above the bottom nav.
  - Username/Customize Home/ticker no longer animate continuously.

## Out of scope
- Native NFC and full APK runtime errors require the actual APK bundle + Logcat to root-cause; the error boundary above is the safe web-side mitigation.

## Files changed
- `src/components/friends/AutoFriendDrop.tsx`
- `src/components/home/WelcomeHeader.tsx`
- `src/components/home/LiveActivityTicker.tsx`
- `src/components/explore/TrendingHashtags.tsx`
- `src/pages/Home.tsx`
