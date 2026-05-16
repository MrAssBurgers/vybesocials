## Goal
Make the app feel like Instagram/Twitter when the network drops: anything that was already loaded (DMs, posts, profiles, comments) stays on screen offline, and the app aggressively reconnects and refreshes the moment the connection returns.

## Approach
Use what's already in place (`@tanstack/react-query` with `networkMode: 'offlineFirst'` and a long `gcTime`) and add a real **persistence layer + reconnect manager** on top. No business logic changes, no per-screen rewrites — one global wiring change handles every list/query in the app.

## Changes

### 1. Persist React Query cache to IndexedDB
Install `@tanstack/react-query-persist-client` and `idb-keyval`. In `src/App.tsx`, wrap the existing `QueryClientProvider` with `PersistQueryClientProvider` backed by an IndexedDB async persister (`createAsyncStoragePersister`).

- Cache survives full reloads and offline cold starts.
- `maxAge`: 24h. `buster`: app build hash so deploys invalidate cleanly.
- `dehydrateOptions.shouldDehydrateQuery`: skip queries whose keys include `realtime`, `presence`, `signed-url`, `live`, or `token` (anything ephemeral/auth-sensitive).
- Don't persist mutations.

Result: on reopen with no internet, every previously-viewed DM thread, post feed, profile, comment list, etc. renders instantly from disk.

### 2. Global reconnect manager (new file `src/lib/reconnectManager.ts`)
A small singleton that:
- Listens to `online`, `visibilitychange`, and `navigator.connection` `change` events.
- When the browser reports online again, runs a fast reachability probe (`HEAD` to `${VITE_SUPABASE_URL}/auth/v1/health` with 2s timeout).
- On confirmed reconnect: calls `queryClient.invalidateQueries({ refetchType: 'active' })` so visible screens refresh; inactive screens stay served from cache until visited.
- While offline: polls the probe every 3s (with backoff to 15s) so we catch the moment the connection actually works, even if `navigator.onLine` is stale (common on mobile / captive portals).

Mount once from `App.tsx`.

### 3. Offline indicator + cache-served banner
Tiny non-intrusive pill (reuse existing toast / status patterns, no new design system tokens) that shows "Offline – showing saved content" when `!isOnline`, and a one-shot "Back online" confirmation when reconnect succeeds. Driven by the existing `useNetworkStatus` hook.

### 4. DM outbox (offline message queue)
In the chat send path (`useSendMessage` / equivalent in `ChatView.tsx`):
- If send fails because offline, write the message to an IndexedDB `outbox` store and optimistically render it with a "Queued" clock icon.
- `reconnectManager` flushes the outbox in FIFO order on reconnect, replaces the optimistic row with the server row on success, and shows a retry affordance on permanent failure.
- Scope: 1-on-1 + group DMs only. Posts/comments stay online-only for v1 (they require media uploads, which need a separate strategy).

### 5. Service worker tweak (`public/sw.js`)
Confirm the existing SW does **not** cache HTML aggressively (we already had stale-content issues). Add a runtime `NetworkFirst` cache for `GET` requests to `*.supabase.co/storage/v1/object/public/*` so already-viewed avatars and post media stay visible offline. Cap at 200 entries / 7 days. No change to auth or REST endpoints (those go through react-query's persisted cache).

## Out of scope (call out for follow-up)
- Offline media **uploads** for new posts/stories (needs background sync + resumable uploads).
- Offline reactions/likes queue.
- Conflict resolution for edits made offline on multiple devices.

## Technical notes
- Files touched: `src/App.tsx`, `public/sw.js`, `src/components/chat/ChatView.tsx` (+ send hook), and three new files: `src/lib/queryPersister.ts`, `src/lib/reconnectManager.ts`, `src/lib/dmOutbox.ts`.
- New deps: `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval`.
- No DB migrations, no edge function changes, no design token changes.
- Persisted cache is per-browser; logging out clears it via `persister.removeClient()` in the existing sign-out flow.
