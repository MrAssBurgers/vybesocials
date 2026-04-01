

## Plan: Polish DM → Clips Viewer Flow (Instagram Reels Style)

### Current State
The system already has the core Instagram-style flow working: `SharedPostBubble` navigates to `/clips/:postId`, the `ClipsViewer` fetches that clip first, then loads a discovery feed below for infinite scroll. Back button and "From Messages" context pill exist.

### What Needs Polishing

#### 1. Eager-load ClipsViewer for instant open
Currently `ClipsViewer` is lazy-loaded, meaning there's a loading spinner when tapping a shared clip in DMs. Move it to eager import (like VybeDNA and Home) so the transition is instant.

**File:** `src/components/layout/AnimatedRoutes.tsx`
- Change from `lazy(() => import("@/pages/ClipsViewer"))` to a direct eager import

#### 2. Preserve DM scroll position when navigating to clip and back
When a user taps a shared clip, leaves to the viewer, then comes back — the chat should be exactly where they left it. Use the existing `scrollMemory` utility to save/restore chat scroll position.

**File:** `src/components/chat/ChatView.tsx` (or equivalent chat scroll container)
- Save scroll position on unmount/navigation away
- Restore on mount/return

#### 3. Smoother transition animation
Add a subtle slide-up transition when opening the clips viewer from DMs, matching Instagram's behavior.

**File:** `src/pages/ClipsViewer.tsx`
- Add an initial slide-up + fade-in animation on the root container when `from === 'messages'`

#### 4. Improve "From Messages" pill with back-to-chat action
Make the "From Messages" pill tappable to return directly to the conversation (not just browser back which can be unreliable).

**File:** `src/pages/ClipsViewer.tsx`
- Make the source label a button that navigates back

### Files Changed
1. `src/components/layout/AnimatedRoutes.tsx` — Eager import ClipsViewer
2. `src/pages/ClipsViewer.tsx` — Slide-up animation, tappable source pill
3. `src/components/chat/ChatView.tsx` — Scroll position preservation on navigation

