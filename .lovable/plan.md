
Fix the global animation system so all persistent color/motion effects loop cleanly with no snap-back, no hard seam line, and no left-right “ping-pong.”

What I found
- The snap is coming from multiple leftover animation systems, not just one keyframe.
- `src/index.css` still has several ping-pong or restart-prone loops (`gradient-shift`, `premium-gold-shimmer`, `badge-shimmer`, `ambient-shift`, `friendlink-shimmer-sweep`, `shimmer-sweep`).
- A few important components still bypass the shared CSS and run their own looping math:
  - `src/components/ui/StyledUsername.tsx`
  - `src/components/ui/VYBELogo.tsx`
  - `src/components/chat/SnapCamera.tsx`
  - `src/components/chat/ChatView.tsx`
  - `src/components/easter-eggs/RainbowOverlay.tsx`
  - `src/components/effects/BackgroundEffects.tsx`
- The create button also has a separate moving highlight beam in `src/components/layout/BottomNav.tsx`, which is likely the “solid line” you’re seeing.
- Some decorative icon motions still use back-and-forth wiggles in `src/components/hub/CreateMenu.tsx`, which makes the app feel less clean.

Plan
1. Rebuild the shared looping gradient system in `src/index.css`
- Standardize all continuous color motion to one direction only: leftward.
- Replace ping-pong/reverse loops with seamless wraparound loops.
- Use consistent horizontal gradient patterns and matching background-size/position math.
- Remove easing on persistent color motion so it stays constant and fluid.
- Soften gradient stop spacing so colors blend into each other instead of forming a stripe.

2. Remove or soften the hard sweep/scan-line overlays
- `src/components/layout/BottomNav.tsx`: remove or heavily soften the extra shimmer beam over the create button.
- `src/index.css`: update beam-style effects such as `shimmer-sweep`, `badge-shine`, and `friendlink-shimmer-sweep` so they don’t read like a hard line cutting across the UI.
- Also soften loading shimmers where needed so they feel blended instead of stripy.

3. Sync all component-level gradient animations to the same loop behavior
- `src/components/ui/StyledUsername.tsx`: match the shared seamless loop exactly.
- `src/components/ui/VYBELogo.tsx`: replace the current diagonal/eased loop with the same leftward seamless motion.
- `src/components/chat/SnapCamera.tsx` and `src/components/chat/ChatView.tsx`: remove `0 → 100 → 0` background-position loops and switch to one-way loops.
- `src/components/easter-eggs/RainbowOverlay.tsx` and `src/components/effects/BackgroundEffects.tsx`: replace visible reversal/reset patterns with the same continuous flow.

4. Clean up the “bouncy” decorative motions
- `src/components/hub/CreateMenu.tsx`: replace wiggle/rotate-back-and-forth decorative motion with subtler movement or hover-only one-shot motion.
- Do a pass on other high-visibility decorative loops so persistent motion feels premium instead of twitchy.

5. Verify the main surfaces after implementation
- Check `/home`, the create button/menu, animated usernames, logo, camera send button, chat gradient card, and ambient overlays.
- Confirm:
  - no visible seam line
  - no snap to the start
  - no left-right bounce
  - no choppy restart
  - motion feels soft, blended, and continuous on desktop and mobile

Files likely to update
- `src/index.css`
- `src/components/layout/BottomNav.tsx`
- `src/components/ui/StyledUsername.tsx`
- `src/components/ui/VYBELogo.tsx`
- `src/components/chat/SnapCamera.tsx`
- `src/components/chat/ChatView.tsx`
- `src/components/easter-eggs/RainbowOverlay.tsx`
- `src/components/effects/BackgroundEffects.tsx`
- `src/components/hub/CreateMenu.tsx`
- `src/components/clips/ClipSkeleton.tsx`

Technical note
- The main fix is consistency: same direction, same loop math, same timing, same gradient structure everywhere.
- Right now the app mixes seamless loops, ping-pong loops, and hard shimmer beams. I’ll normalize all persistent decorative motion so it behaves like one polished system.
