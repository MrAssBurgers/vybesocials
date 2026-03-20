

## Plan: Polish ClipsViewer to Match Instagram Reels DM Experience

### What's Already Working
The `/clips/:postId` route, initial post fetch, infinite feed, scroll snapping, and IntersectionObserver playback are all in place. This is a polish pass to make it feel as smooth as Instagram Reels.

### Changes

**1. Fix fullscreen height (ClipsViewer.tsx)**
- Remove the `BOTTOM_NAV_HEIGHT` subtraction since `hideNav` is already true — currently leaving an 80px black gap at the bottom on mobile
- Use `100dvh` everywhere, with `env(safe-area-inset-bottom)` padding for notched phones

**2. Clean up initial post fetch**
- Remove the dead `get_posts_with_counts` RPC call (lines 74-80) that runs before the actual query and does nothing useful

**3. Cleaner mobile UI**
- Make the back button + "From Messages" pill use safe-area top inset so they don't clip under the status bar on notched devices
- Add a subtle entry animation (fade in) for the first video load
- Remove `AppLayout` wrapper entirely — this should be a true fullscreen overlay with no layout chrome, just like Instagram Reels

**4. Ensure SharedPostBubble navigates correctly for all media types**
- Already navigates to `/clips/:postId` for videos — verify image posts still go to `/p/:postId`

**5. Smoother scroll behavior**
- Add `-webkit-overflow-scrolling: touch` (already present, good)
- Ensure `scrollBehavior: 'smooth'` doesn't interfere with snap on iOS — move to CSS class instead of inline style for better browser compat

### Files to Edit
- `src/pages/ClipsViewer.tsx` — height fix, remove dead code, remove AppLayout wrapper, safe-area insets, entry animation

