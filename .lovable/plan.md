## Plan: stabilize DMs on mobile

1. **Stop presence from causing DM-page churn**
   - Update the presence hook so it does **not** write `offline` during normal route remounts, StrictMode cleanup, mobile tab hiding, or app backgrounding.
   - Keep heartbeat updates while visible, but only mark offline on real page unload when safe.
   - Remove the immediate refetch after presence realtime changes; update/cache presence status without forcing network refetch storms.

2. **Keep DM data online-first**
   - Change `dm-conversations` from `offlineFirst` to `online` so it does not trust stale/offline state when the live app is reachable.
   - Exclude `dm-conversations`, `conversations`, and `messages` from long-lived IndexedDB query persistence so old/offline DM snapshots cannot override fresh data on app boot.
   - Preserve current in-memory placeholder behavior so the list does not flash empty during normal refreshes.

3. **Narrow reconnect/offline refreshes**
   - Replace global “invalidate every active query” reconnect behavior with a safer active refetch that avoids presence-driven full-app churn.
   - Keep reconnect refresh for important mounted data, but prevent presence/offline probes from cascading into DM list reload loops.

4. **Patch remaining broad DM invalidations**
   - Scope the broad `['dm-conversations']` / `['conversations']` invalidations in trash/options/share/message paths to the current profile where practical.
   - This prevents unrelated cache keys from refetching and flashing the DM list.

5. **Verify the fix**
   - Re-scan for broad DM invalidations and presence forced refetches.
   - Confirm the DM page will show cached in-memory data while refreshing, but will not boot from stale offline DM persistence or flip online/offline every remount.