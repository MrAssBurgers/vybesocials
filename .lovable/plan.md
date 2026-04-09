

## Plan: Deep Scan Fix — Stability, Performance, and UI Polish

### Critical Bugs

**1. Infinite Re-render Loop in `useSwingDetection.ts`**
The `handleMotion` callback depends on `lastSwingTime` state (line 106), but also calls `setLastSwingTime` (line 89). This creates a cascade: state change → new `handleMotion` → new `startListening`/`stopListening` → effect re-runs → removes and re-adds listener → repeat. This is the "Maximum update depth exceeded" error flooding the console on the Home page.

**Fix**: Use a ref for `lastSwingTime` instead of state, eliminating the dependency cycle entirely.

**2. `autoCloseAfterSuccess` stale closure in `AutoFriendDrop.tsx`**
Line 156 reads `createdConversationId` inside a `setTimeout`, but this captures the value at callback creation time (always `null`). The conversation ID set on line 149 is never read.

**Fix**: Use a ref for `createdConversationId` so the timeout always reads the latest value.

---

### UI & Layout Fixes

**3. FriendMap — Ghost Mode FAB overlaps bottom friend strip on small screens**
The FAB is positioned at `bottom: max(calc(env(safe-area-inset-bottom) + 180px), 196px)` which is fragile. On short phones (iPhone SE), it can overlap with the friend card.

**Fix**: Position the FAB relative to the bottom panel using a proper flex/stack layout instead of magic pixel values.

**4. FriendMap — Search overlay can extend behind notch**
The search overlay uses `top: calc(max(env(safe-area-inset-top), 16px) + 4px)` but the input can still clip on newer iPhones with Dynamic Island.

**Fix**: Add proper `pt-safe` padding inside the overlay.

**5. FriendMap — Missing `key` stability on search results**
Search results use array index as key (`key={i}`), causing React reconciliation issues when results change order.

**Fix**: Use `r.lat + r.lon` as a stable key.

**6. Bottom nav hidden routes missing `/clips`**
`HIDDEN_NAV_ROUTES` in `RootBottomNavMount.tsx` doesn't include `/clips`, but `MobileHeader.tsx` manually hides on `/clips`. The bottom nav may still flash on clips.

**Fix**: Add `/clips` and `/spaces` to `HIDDEN_NAV_ROUTES`.

---

### Performance Fixes

**7. FriendMap — Markers recreated every render**
The friend markers effect (line 542) calls `layer.clearLayers()` and rebuilds all markers on every `clusteredMarkers` or `selId` change. With many friends, this causes jank.

**Fix**: Only update changed markers by tracking them in a Map<string, L.Marker> ref instead of clearing and rebuilding.

**8. FriendMap — Nominatim nearby fetch fires multiple categories in parallel without rate limiting**
Nominatim has a 1 request/second policy. Firing 5 parallel requests risks getting rate-limited/blocked.

**Fix**: Fetch categories sequentially with a small delay, or combine into a single `amenity` query.

**9. useSwingDetection — event listener churn**
Because `handleMotion` recreates on every render (due to `lastSwingTime` dep), `startListening`/`stopListening` recreate, and the effect removes and re-adds the event listener every cycle.

**Fix**: Already solved by fix #1 (switching to ref).

---

### Polish & Quality-of-Life

**10. FriendMap — Add "No location permission" empty state**
When sharing is off and no friends are visible, the map shows a generic "No friends sharing" message. Should show a more actionable prompt with a button to enable sharing.

**11. FriendMap — Improve friend card "Message" button**
Currently navigates to `/messages` (the list), not to the actual conversation with that friend. Should create or find the existing conversation.

**12. Map style picker — doesn't close on outside click**
The styles dropdown stays open when tapping the map.

**Fix**: Add a click-outside handler or close on map click.

**13. `AutoFriendDrop` — multiple callbacks with inline `useCallback` in hook args**
Lines 172-226 pass `useCallback` inline as hook arguments, which is a React anti-pattern and can cause stale closures.

**Fix**: Extract callbacks to named variables before passing to the hook.

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useSwingDetection.ts` | Replace `lastSwingTime` state with ref to fix infinite loop |
| `src/components/friends/AutoFriendDrop.tsx` | Fix stale closure for conversation ID; extract inline callbacks |
| `src/pages/FriendMap.tsx` | Stable keys, fix FAB positioning, improve message button, close styles on map click, add empty state, sequential Nominatim requests |
| `src/components/layout/RootBottomNavMount.tsx` | Add `/clips` and `/spaces` to hidden routes |

### No database changes required.

