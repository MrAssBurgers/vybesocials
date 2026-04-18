
The user wants:
1. Preload all animations (so they don't stutter on first play)
2. Speed up image loading
3. Speed up post loading

Let me think about what's already in place based on the files I can see:
- `useSmartPreload.ts` exists with network-adaptive preloading
- `useNetworkStatus.ts` for adaptive quality
- `performanceConfig.ts` with cache config (10min stale, 1hr gc)
- `routePreloader.ts` for route component preloading
- Animations defined in `src/index.css` (gradient flows, etc.)

Let me check what likely exists for posts/images to plan properly.

## Plan: Faster Posts, Images & Animation Preloading

### 1. Image Loading Speed
- **Eager-decode hero images**: Add `decoding="async"` + `fetchpriority="high"` to above-the-fold post images (first 3 in feed, first story, avatars in viewport).
- **Progressive blur-up**: Use Supabase storage transform `?width=40&quality=20` as a tiny placeholder while full image loads — instant visual feedback.
- **Preconnect to Supabase storage**: Add `<link rel="preconnect">` and `<link rel="dns-prefetch">` to `index.html` for the storage CDN so the first image request skips DNS+TLS handshake (~200-400ms saved).
- **Increase concurrent loads** in `performanceConfig.ts` from 6 → 10 on fast connections.
- **Aggressive lazy-load margin**: Bump `lazyLoadMargin` from 200px → 600px so images start fetching well before they enter view.

### 2. Post Loading Speed
- **Prefetch next page** of feed when user scrolls past 60% of current page (instead of waiting for end).
- **Increase React Query `staleTime`** for feeds from 10min → keep, but add `placeholderData: keepPreviousData` so pagination feels instant.
- **Preload first 5 post media URLs** as soon as the feed query resolves (using existing `useSmartPreload`).
- **Skeleton → content fade**: ensure feed renders skeletons instantly while data loads (verify already in place).

### 3. Animation Preloading
- **Force GPU layer promotion** on key animated elements at mount via `transform: translateZ(0)` + `will-change` set briefly then removed (avoid memory bloat).
- **Preload Framer Motion** chunk on app boot so first animation doesn't wait for chunk download.
- **Preload Lottie/animated assets**: if the app uses any Lottie JSON (splash, badges, reactions), fetch them at idle time after initial render.
- **Warm CSS keyframes**: trigger a hidden 1px element with each major keyframe animation at app boot so the browser compiles them once — eliminates first-play jank for `gradient-flow`, `fade-in`, `scale-in`, etc.

### 4. Files to touch
- `index.html` — preconnect/dns-prefetch tags
- `src/lib/performanceConfig.ts` — bump lazy margin & concurrent loads
- `src/lib/routePreloader.ts` — add Framer Motion preload
- `src/components/feed/*` (Home/feed component) — fetchpriority, prefetch next page, preload media URLs
- `src/main.tsx` or `src/App.tsx` — add animation warm-up component on boot
- New: `src/lib/animationWarmup.ts` — invisible element that runs each keyframe once at idle
- New: `src/components/common/ProgressiveImage.tsx` (if not present) — blur-up placeholder wrapper

### 5. Expected wins
- First image visible: ~300-500ms faster (preconnect + fetchpriority)
- Pagination: feels instant (keepPreviousData + 60% prefetch)
- Animations: zero first-play stutter (keyframe warm-up)
- Scroll: smoother (larger lazy margin = no pop-in)

No database migrations needed. No new dependencies.
