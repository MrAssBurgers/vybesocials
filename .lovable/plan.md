
Goal
- Keep the Messages screen content fully below the fixed VYBE mobile header.
- Make horizontal mouse-wheel scrolling work consistently and smoothly for Quick Add and VYBE DNA.

What I found
- The clipping is coming from `src/pages/Messages.tsx`, not from the chat row itself. On mobile, the messages shell is still being rendered with `position: fixed`, `inset: 0`, and `z-index: 50` even when you are just on `/messages`. That makes the list sit under the fixed top header.
- `QuickAddRow.tsx` and `MutualFriendsQuickAdd.tsx` each have their own wheel listener, but they use a fragile per-event `scrollBy({ behavior: 'smooth' })` approach.
- `DNASimilarUsers.tsx` uses the shared `ScrollArea` horizontal primitive, and that primitive currently has no mouse-wheel-to-horizontal support, so DNA scrolling fails on mouse even if touch works.

Implementation plan
1. Fix the top clipping at the layout level
   - Update `src/pages/Messages.tsx` so the fullscreen fixed shell is only used for immersive mobile chat view (`isInChat && !isDesktop`).
   - For the normal `/messages` list screen, let the page stay in normal layout flow so `AppLayout`’s mobile header offset keeps everything under the VYBE top bar.
   - Do not add random extra padding inside `ConversationList`; fix the outer shell so the whole screen lays out correctly.

2. Centralize horizontal mouse scrolling
   - Add one shared horizontal-wheel helper for overflow rows.
   - Behavior:
     - translate dominant wheel motion into horizontal scrolling;
     - only `preventDefault()` when the row can actually move left/right;
     - use eased/requestAnimationFrame-style movement for a smoother left/right transition;
     - leave touch drag/native scrolling intact.

3. Apply the shared fix to the affected rails
   - `src/components/chat/QuickAddRow.tsx`
   - `src/components/chat/MutualFriendsQuickAdd.tsx`
   - `src/components/ui/scroll-area.tsx` when `horizontal` is enabled, so `src/components/dna/DNASimilarUsers.tsx` works automatically too.

4. Make sure the rails truly overflow
   - Tighten the inner row sizing where needed (`min-w-max` / `w-max` pattern if required) so the browser definitely creates a horizontal scrollable area.
   - Keep smooth visual motion without relying on repeated `scrollBy({ behavior: 'smooth' })` calls.

Files to update
- `src/pages/Messages.tsx`
- `src/components/chat/QuickAddRow.tsx`
- `src/components/chat/MutualFriendsQuickAdd.tsx`
- `src/components/ui/scroll-area.tsx`
- possibly `src/components/dna/DNASimilarUsers.tsx` only if its inner content needs explicit width for overflow

Verification
- On mobile `/messages`, the chat header/search/filter area starts fully below the fixed VYBE header with nothing clipped.
- On mouse, Quick Add scrolls left/right smoothly with the wheel.
- On mouse, the VYBE DNA “Similar DNA Matches” row scrolls left/right the same way.
- Vertical page scrolling still works normally once a horizontal row reaches either edge.
