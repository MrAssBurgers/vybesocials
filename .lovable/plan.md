

## Plan: Perfect the VybeMap — Live Location, Snap-Style UI Revamp, Backend Hardening

### What's changing

The Friend Map gets a complete overhaul to match Snapchat's map experience: always-on live location tracking, real-time friend updates, and a polished immersive UI that fills every pixel of the phone screen.

---

### 1. Enable Realtime on `user_locations`

Add a migration to enable Supabase Realtime so friend locations update live without polling:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;
```

This replaces the current 30-second polling with instant updates.

---

### 2. Always-On Live Location with `watchPosition`

Replace the current one-shot `getCurrentPosition` with the browser's `watchPosition` API:

- Start watching on mount (with user permission).
- Continuously update `user_locations` via upsert every ~15 seconds (debounced to avoid spamming).
- Remove the 8-hour expiry concept — location stays live as long as sharing is enabled.
- Add an "always on" toggle that persists the sharing preference so it survives page reloads.
- Use `enableHighAccuracy: true` for GPS-level precision (no more 2-decimal rounding — store full precision, only fuzz for *other users' display*).

---

### 3. Realtime Subscription for Friend Markers

Subscribe to `postgres_changes` on `user_locations` filtered to friend IDs:

- On `INSERT`/`UPDATE`, update markers in real-time (smooth `setLatLng` transitions).
- On `DELETE` or `sharing_enabled = false`, remove marker immediately.
- Replace the `refetchInterval: 30000` polling entirely.

---

### 4. Snap-Style UI Revamp

Complete visual overhaul of `FriendMap.tsx`:

**Top bar:**
- Minimal frosted-glass pill with just the back arrow and a search/filter icon.
- Remove the "Friend Map" title — let the map speak for itself.

**My location indicator:**
- Larger pulsing Bitmoji-style dot with a glowing ring animation.
- Accuracy circle overlay showing GPS precision radius.

**Friend markers:**
- Snap-style 3D-ish avatar bubbles with subtle bounce-in animation.
- Activity status indicator (green dot = active now, grey = last seen X ago).
- Tap to expand into a card that slides up from below.

**Bottom panel redesign:**
- Horizontal scrollable friend avatars strip (Snap's "Friends" row at bottom).
- Each avatar shows a colored ring when actively sharing.
- Pull-up drawer with friend list, sorted by proximity.
- Sharing toggle redesigned as a floating action button (FAB) with pulse animation when off.

**Map styling:**
- Keep satellite tiles but add a subtle dark overlay vignette at edges.
- Smooth fly-to animations with spring easing.
- Pinch-to-zoom with momentum.

---

### 5. Remove Bottom Nav Completely

Ensure `/map` is in `HIDDEN_NAV_ROUTES` (already done) and that `AppLayout` renders with `hideNav noPadding` so zero chrome interferes with the immersive map.

---

### 6. Accuracy & Performance

- Use `enableHighAccuracy: true` + `maximumAge: 0` for real GPS data.
- Show accuracy circle on map using `L.circle()`.
- Debounce DB writes to every 15 seconds to avoid excessive upserts.
- Clean up `watchPosition` on unmount to prevent battery drain.

---

### Files to modify

| File | Change |
|------|--------|
| `src/pages/FriendMap.tsx` | Full rewrite — live tracking, realtime subscription, Snap UI |
| New migration SQL | `ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations` |

### Technical notes

- The `user_locations` table already exists with the correct schema (confirmed in DB).
- Types are already generated in `types.ts` — can remove `(supabase as any)` casts.
- Realtime channel will use `supabase.channel('friend-locations').on('postgres_changes', ...)`.
- `watchPosition` returns a watcher ID for cleanup in the `useEffect` return.

