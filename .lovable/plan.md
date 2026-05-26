## Clips: scroll + video alignment

`src/pages/ClipsViewer.tsx` and `src/components/posts/MobileShortCard.tsx`
- Lock the scroll container to true viewport height and remove conflicting touch handlers that fight the snap scroller:
  - Container: `h-[100svh]` (small-viewport unit) instead of `100dvh`, add `touch-action: pan-y`, keep `overscroll-contain` + `snap-mandatory`.
  - Each snap item: `h-[100svh] w-full snap-start snap-always`, and drop the `max-w-[480px]` constraint on mobile — vertical clips should fill the viewport, only desktop gets the centered max-width column.
- Make video placement consistent: switch the video/img from `object-contain` to `object-cover` for 9:16 clips so they fill the frame instead of letterboxing off-center.
- Push UI inside iOS safe areas:
  - Right action rail bottom offset becomes `calc(env(safe-area-inset-bottom) + 88px)`.
  - Bottom caption block becomes `calc(env(safe-area-inset-bottom) + 16px)`.
- Stop the media touch handlers from swallowing the snap scroll: change the inner media listener from `onTouchStart/End` to pointer events with `touch-action: pan-y` on the media wrapper so vertical drag still scrolls between clips.
- The progress-dots strip on `ClipsViewer` stays desktop-only; mobile relies on snap-scroll.

## Hold-to-share drag UX

`src/components/share/HoldToShare.tsx` (refactor in place)
- Increase visual quality so the menu reads as the primary surface:
  - Larger floating card (`w-[320px]`, `py-3`), brighter `bg-background/95` + `border-primary/20`, soft glow ring.
  - Avatars become 56px with username chip underneath; hovered avatar gets a glowing primary ring + scale 1.22 + lift -10px.
- Drag-without-release flow (the part the user says is broken):
  - `pointerdown` on the share button: start 280 ms hold timer, fire `triggerHaptic('medium')` and open the menu the instant it elapses; do NOT require finger lift.
  - While the menu is open, finger keeps moving (`pointermove` on `window`): hit-test against `[data-quick-share-target]` and fire `triggerHaptic('light')` once on enter, `triggerHaptic('selection')` once when crossing onto a NEW target.
  - On `pointerup` over a target: `triggerHaptic('success')`, play the existing shoot-off + paper-plane animation, send via `sendShareToUser`, then close. On `pointerup` off any target: close silently.
- Use the existing `getQuickShareTargets(profile.id, 4)` so we keep the “top 4 most recently sent friends” behaviour. Add a small empty-state: if there are no recent friends, hold opens the full `ShareSheet` instead (fallback so hold is never a dead gesture).
- Suppress the trailing synthetic `click` for 400 ms after a successful drag-send so the `ShareSheet` doesn’t pop on release.

## TikTok-style follow `+` button under avatar

`src/components/posts/MobileShortCard.tsx` (and mirror in `src/components/posts/ShortCard.tsx` for desktop)
- Under the right-rail avatar add a new `FollowPlusButton` (new file `src/components/clips/FollowPlusButton.tsx`).
  - Reads/writes `follows` table (`follower_id = profile.id`, `following_id = post.author.id`) — same pattern as `useProfile.ts`.
  - Hides itself entirely when `post.author.id === profile.id` or when already following before mount (so we only show `+` for not-yet-followed authors, then morph + disappear).
- Visual + animation states (Framer Motion):
  1. **Idle**: pink/primary `+` badge (`h-6 w-6 rounded-full`) overlapping avatar bottom-center, white ring, drop-shadow.
  2. **Tap**: scale 0.85 → 1.15 spring; swap icon to `Check` with `AnimatePresence mode="popLayout"`.
  3. **Confetti burst**: render 14 colored particles (reuse the existing heart-burst math from `MobileShortCard`) emitting from the badge center over 600 ms.
  4. **Follow-through**: badge animates 360 ms toward the avatar center, scales to 0, then unmounts — leaving the avatar with no badge (matches TikTok).
- DB write is optimistic with rollback on error; toast only on failure (matches project preference for silent success).
- Reuses existing `triggerHaptic('success')` on confirm.

## Files touched

- edit `src/pages/ClipsViewer.tsx` — svh height, drop mobile max-width, safe-area aware bottom.
- edit `src/components/posts/MobileShortCard.tsx` — object-cover, pointer-event touch handling, safe-area offsets, mount `FollowPlusButton`.
- edit `src/components/posts/ShortCard.tsx` — mount `FollowPlusButton` for desktop.
- rewrite `src/components/share/HoldToShare.tsx` — drag-without-release, polished menu, fallback to `ShareSheet`.
- new `src/components/clips/FollowPlusButton.tsx` — `+` → check → confetti → fly-into-avatar.

No DB migrations or backend changes — uses the existing `follows` table and existing `getQuickShareTargets` / `sendShareToUser` helpers.
