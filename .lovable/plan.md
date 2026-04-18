
User wants: when scrolling the feed, the next 3 posts must already be fully loaded (media decoded, ready to display) before the user reaches them. No waiting, no pop-in.

Current state (from files I've seen):
- `useInfinitePosts.ts` already pre-signs URLs and calls `preloadSignedMedia` (creates `new Image()` for thumbnails) on every page fetch.
- `useSmartPreload.ts` exists with `preloadAhead` config and idle-callback preloading, but it's index-driven and pauses during scroll.
- `performanceConfig.ts` has `lazyLoadMargin: 600px` and `maxConcurrentLoads: 10`.
- Pagination only fetches next page when `nextPage` triggers (likely at the very end via IntersectionObserver).

Problems:
1. Next-page fetch likely fires too late (at the last visible post), so user hits a loading state.
2. `useSmartPreload` pauses during active scroll — exactly when we need it most for the next 3 posts.
3. Videos only get metadata preloaded, not the first frame/buffer.
4. No explicit "+3 ahead" media warming tied to the currently-viewed post index.

## Plan

### 1. Aggressive next-page prefetch (`useInfinitePosts.ts`)
- Expose a helper or auto-trigger so `fetchNextPage()` fires when user is within **5 posts** of the end (not at the end). This keeps the buffer always full.
- In the feed component, call `fetchNextPage()` early via an IntersectionObserver placed on the post 5 from the bottom.

### 2. New hook: `useAheadMediaPreload(posts, currentIndex, ahead=3)`
- Replaces the scroll-pausing logic of `useSmartPreload` for feed media.
- For the next N posts after `currentIndex`:
  - Pre-sign URLs (already cached via `signedUrlCache`).
  - Create `Image()` objects for thumbnails AND full media (images).
  - For videos: create `<video preload="auto">` elements with `currentTime = 0.1` to force first-frame decode (small buffer, ~100KB).
- Run **immediately** on index change — do NOT pause during scroll. The user is scrolling toward these posts; we need them ready.
- Cap concurrent loads at 6 so we don't hammer the network.
- Use a ref-based dedupe set so we never re-fetch the same URL.

### 3. Wire into the feed component
- Find the active feed component (likely `src/pages/Home.tsx` or `src/components/feed/FeedContainer.tsx` — will locate during implementation).
- Track `currentVisibleIndex` via IntersectionObserver on each post card (threshold 0.5).
- Pass `posts` array + `currentVisibleIndex` to `useAheadMediaPreload`.
- Also call `fetchNextPage()` when `currentVisibleIndex >= posts.length - 5`.

### 4. Video first-frame warming
- New helper `warmVideoFirstFrame(url)` in `useSmartPreload.ts`:
  - Creates hidden `<video>`, sets `preload="auto"`, `muted=true`, seeks to 0.1s, waits for `loadeddata`, then removes element (browser keeps decoded frame in cache).
- Used by `useAheadMediaPreload` for video posts.

### 5. Bump preload buffer in performance config
- `maxConcurrentLoads`: 10 → 12 on fast connections.
- Add `feedPreloadAhead: 3` constant for consistency.

### 6. Files to touch
- New: `src/hooks/useAheadMediaPreload.ts`
- Edit: `src/hooks/useSmartPreload.ts` (add `warmVideoFirstFrame` export)
- Edit: `src/lib/performanceConfig.ts` (bump concurrent loads, add constant)
- Edit: feed container/page (locate during implementation — Home, Clips, FeedContainer)
- Edit: `src/hooks/useInfinitePosts.ts` (no changes needed unless prefetch trigger needs adjustment)

### Expected result
- Posts within 3 ahead of viewport are fully decoded and ready before user reaches them.
- Next page fetched 5 posts before end, never blocking.
- Videos show first frame instantly on entry.
- Zero loading spinners during normal scroll.

No DB changes. No new dependencies.
