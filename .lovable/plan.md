
Goal

Make every continuous color animation behave like a conveyor belt: always moving left, never bouncing, never visibly cutting back to frame 1.

What’s causing the snap

- The shared keyframes in `src/index.css` still move `300%`-wide gradients from `0%` to `-100%`. That lands on a different slice of the strip, so the browser has to jump when the loop restarts.
- Several animated gradients are not loop-safe yet because the color sequence itself does not tile cleanly. The biggest ones are the animated name gradients in `src/lib/cosmeticConstants.ts`, plus the inline logo/chat/camera/overlay gradients.
- A few high-visibility surfaces bypass shared CSS and animate `backgroundPosition` directly with Framer Motion (`SnapCamera.tsx`, `ChatView.tsx`, `ClipSkeleton.tsx`). Those still have their own restart math.
- The narrow white beam in `src/components/layout/BottomNav.tsx` is also reading like a hard seam line.

Plan

1. Rebuild the shared seamless-loop rules in `src/index.css`
- Standardize persistent decorative motion to one-way, linear, leftward movement.
- Replace restart-prone keyframes (`gradient-shift`, `badge-shimmer`, `premium-gold-shimmer`, `ambient-shift`, `friendlink-shimmer-sweep`, `rainbow-bg-scroll`, and any active ping-pong border flow) with loop-safe tile math: duplicate the gradient segment and animate only one repeat interval so the last frame matches the first.
- Soften stop spacing so colors bleed together instead of forming a stripe.

2. Make the gradient data itself loop-safe
- Update animated gradient definitions in `src/lib/cosmeticConstants.ts` so `Holographic` and `Premium Gold` wrap cleanly.
- Align any duplicated preview map in `src/components/vybepass/VybePassSheet.tsx` so previews and live text use the same gradient recipe.
- In `src/components/ui/StyledUsername.tsx` and `src/components/ui/VYBELogo.tsx`, make animated text use the same seamless horizontal strip instead of ad-hoc gradient strings.

3. Remove component-level restart math and unify on the shared loop
- `src/components/chat/SnapCamera.tsx`
- `src/components/chat/ChatView.tsx`
- `src/components/clips/ClipSkeleton.tsx`
- `src/components/easter-eggs/RainbowOverlay.tsx`
- `src/components/effects/BackgroundEffects.tsx`

For these, replace local `backgroundPosition` array loops and reverse/eased background sweeps with the same seamless one-way loop system from CSS. The aurora second layer will stop reversing, and the camera/chat/loading surfaces will stop jumping at the loop point.

4. Clean up the hard seam on the create button
- In `src/components/layout/BottomNav.tsx`, remove the narrow white scan-line or replace it with a wider, much softer wash so the button looks blended instead of sliced by a bright line.

5. Verify the places where the snap is most visible
- `/home` animated usernames and create button
- logo text
- camera send button
- chat gradient card
- rainbow/aurora overlays
- loading shimmers

Success means:
- no visible snap to frame 1
- no hard seam line crossing the surface
- no left-right ping-pong
- motion keeps drifting left until it naturally cycles into the same visual state

Files I expect to update
- `src/index.css`
- `src/lib/cosmeticConstants.ts`
- `src/components/ui/StyledUsername.tsx`
- `src/components/ui/VYBELogo.tsx`
- `src/components/chat/SnapCamera.tsx`
- `src/components/chat/ChatView.tsx`
- `src/components/clips/ClipSkeleton.tsx`
- `src/components/easter-eggs/RainbowOverlay.tsx`
- `src/components/effects/BackgroundEffects.tsx`
- `src/components/layout/BottomNav.tsx`
- optionally `src/components/vybepass/VybePassSheet.tsx` if I need to remove the duplicated non-loop-safe preview gradient

Technical note

The real fix is not just “make it slower” or “more linear.” The fix is making every loop end on the exact same visual slice it started on. Right now some animations travel across a non-repeating strip, so the restart is guaranteed. I’ll convert them to a true repeating cycle so they keep moving and only return to the beginning when the beginning already looks identical to the current frame.
