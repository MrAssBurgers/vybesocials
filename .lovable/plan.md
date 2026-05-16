## Goal
When the user opens the app with no internet (cold start, hard refresh, switching tabs and coming back offline), the **real Vybe app shell** loads from cache and renders all previously-cached DMs/posts/profiles — never the static `/offline.html` placeholder.

## Why it currently fails
The service worker's navigation handler does `fetch(request).catch(() => caches.match('/offline.html'))`. The actual `index.html` and Vite bundles aren't precached, so any offline navigation falls back to the static placeholder page. React-Query persistence (already shipped) is useless if the app shell itself never boots.

## Approach
Turn the SW into a true **app-shell PWA**: cache `index.html` and the hashed JS/CSS chunks on the fly, serve them with a network-first-then-cache strategy on navigation, and only show `/offline.html` as the very last resort (no shell ever cached + no network).

## Changes (`public/sw.js` only — bump to `vybe-v6`)

1. **Bump cache names** (`vybe-v6`, `vybe-static-v6`, `vybe-shell-v1`) and add the old names to the activate-time cleanup list so stale shells are purged on update.

2. **App-shell cache**:
   - On `install`, attempt to cache `/` (the SPA entry) into `vybe-shell-v1`. Best-effort — failures don't block install.
   - On every successful navigation fetch, store the response in `vybe-shell-v1` keyed to `/` (single canonical entry, so we don't grow unbounded).

3. **New navigation strategy** (replaces lines 99–111):
   ```
   try network (3s timeout)
     → on success: update shell cache, return response
     → on failure / timeout: return cached shell (/) 
                              → if missing, return cached /offline.html
                              → if missing, minimal inline 503
   ```
   This means: online users always get fresh HTML; offline users get the last known-good shell, which then hydrates React, which then reads the persisted react-query cache from IndexedDB and renders DMs/posts/profiles instantly.

4. **JS/CSS chunk caching** (currently explicitly skipped per comment on line 125):
   - Add a runtime cache (`vybe-assets-v1`) using **stale-while-revalidate** for same-origin requests whose pathname matches `/assets/` (Vite output dir) AND has a content-hash in the filename (regex `\.[a-f0-9]{8,}\.(js|css|woff2?)$`).
   - Content-hashed filenames are immutable, so caching them is safe and the original "stale bundle = black screen" risk doesn't apply (a new deploy ships new hashes; old hashes stay valid for any client still on the old shell).
   - Cap the cache at 60 entries with FIFO eviction to prevent unbounded growth across deploys.

5. **Don't break Lovable preview**: keep the existing `SW_BYPASS_PATHS` and add a guard so the new asset cache only runs when `self.location.origin === url.origin` (skip cross-origin CDN bundles).

6. **Cleanup**: bump `CACHE_NAME` constants and rely on the existing activate handler's `VALID_CACHES` set to evict v5 caches automatically on the next launch.

## Out of scope
- No changes to React code, `App.tsx`, react-query persistence, or the reconnect manager (already shipped last turn).
- No new dependencies.
- Offline media **uploads** and offline-send DM outbox remain follow-ups.

## Verification
After deploy, the user should be able to: load the app online once → kill wifi → hard refresh → see the full Vybe UI with their cached DMs/feed, not the static offline page. The "Offline — showing saved content" pill confirms cache mode.
