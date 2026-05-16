## Goal
Make VYBE keep previously loaded content visible and fast across scrolling, app restarts, and airplane mode. The app should show cached posts/DMs/profiles immediately, then refresh as soon as internet returns.

## What I’ll change

1. **Strengthen offline data persistence**
   - Extend React Query persistence from 24 hours to a longer social-app cache window.
   - Keep feed, profile, DM conversation, and message queries in memory longer so scrolling away/back does not reload from scratch.
   - Prevent offline query failures from replacing already-loaded data with empty/error states.

2. **Fix the app shell for real offline starts**
   - Keep service-worker app-shell caching for published/PWA/native builds.
   - Do not restore the old offline placeholder page.
   - Cache the real app shell and hashed JS/CSS chunks more aggressively so opening the app in airplane mode can still boot the React app if it was opened online before.
   - Keep Lovable preview service-worker cleanup rules intact so preview does not get stale.

3. **Make post media stay loaded when scrolling fast**
   - Increase feed page/cache retention and preload-ahead distance.
   - Persist loaded feed pages so posts already fetched remain available when scrolling down/up quickly.
   - Improve media caching strategy for post images/thumbnails/avatars so already viewed media is served from browser cache instead of blanking.
   - Avoid unnecessary remount/refetch patterns that make viewed posts feel like they disappeared.

4. **Make DMs/messages usable offline after loading once**
   - Change conversations/messages queries to show cached data instantly and not force-refetch on mount while offline.
   - Keep realtime/online refresh behavior, but only update in the background after connectivity is confirmed.
   - Preserve last-loaded conversations and message threads across app restarts.

5. **Reconnect fast when internet returns**
   - Replace the current health probe that returns 401 with a proper lightweight reachability check that does not generate auth/API-key errors.
   - Keep aggressive offline polling, but avoid noisy failed requests while offline.
   - Refresh active screens immediately once the app detects real connectivity.

6. **Verify with performance/offline checks**
   - Use browser performance profiling on the home feed.
   - Validate that scrolling back up does not trigger blank cards or refetch-only loading states.
   - Validate that cached content remains visible when network requests fail/offline.

## Important limits
- Truly new content cannot load without internet.
- Media that was never opened/preloaded before going offline cannot appear offline.
- A full airplane-mode cold launch only works after the app shell and chunks were cached at least once in the installed/published app; the Lovable editor preview intentionally disables service workers to prevent stale builds.