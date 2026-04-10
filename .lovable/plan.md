

## Updated Plan: Fix 7 UI Issues + 5 Backend/Runtime Errors

### Part A — UI Fixes (from previous plan, unchanged)

1. **Explore tab not pinned to top** — Fix in `Explore.tsx`
2. **Map not fullscreen** — Tighten top padding in `FriendMap.tsx`
3. **Reaction picker position unstable** — Anchor directly above button in `ReactionPicker.tsx`
4. **Reaction picker clipped in Clips** — Use `ReactDOM.createPortal` to render into `document.body`
5. **Clips reaction menu should be vertical** — Add `vertical` prop, pass from `MobileShortCard.tsx`
6. **Quick Add row moves freely** — Add `touch-action: pan-x` and `overflow-y: hidden` to `QuickAddRow.tsx` and `MutualFriendsQuickAdd.tsx`
7. **VYBE DNA sticky header** — Fix `sticky top-0 z-20` in `VybeDNA.tsx`

### Part B — New Issues (from pending errors)

**8. `add_user_xp` 404 on Live (3-arg version missing)**

The client in `useBugBountyDetector.ts` calls `add_user_xp({ p_user_id, p_xp, p_source })` but only the 2-arg version exists. The new migration needs to also recreate a 3-arg overload that accepts `p_source` and writes to `user_levels`.

- **File**: New migration SQL — add 3-arg `add_user_xp(uuid, integer, text)` targeting `user_levels`

**9. `track_daily_login` FK violation (409)**

`track_daily_login` calls `add_user_xp(v_profile_id, ...)` passing the **profile ID**, but `user_levels.user_id` references `auth.users(id)`. Profile IDs are not auth user IDs.

- **Fix**: Update `add_user_xp` to accept a profile ID and internally look up the auth user ID from `profiles`, OR fix `track_daily_login` to pass `v_auth_id` instead of `v_profile_id`. The simpler fix: change line 57 in `track_daily_login` from `add_user_xp(v_profile_id, ...)` to `add_user_xp(v_auth_id, ...)` since `user_levels` FK references `auth.users`.
- **File**: New migration to `DROP` and recreate `track_daily_login` with the corrected parameter

**10. Mic visualization permission error**

`CallSettingsSheet.tsx` calls `getUserMedia` inside a `useEffect`, not from a user gesture. The browser blocks it.

- **Fix**: Don't auto-start mic visualization on sheet open. Instead, add a "Test mic" button the user taps, which triggers `getUserMedia` from a click handler.
- **File**: `src/components/call/CallSettingsSheet.tsx`

**11. VybeSnapCamera permission error**

Same issue — camera `getUserMedia` called outside a user gesture context. The existing `useCameraPreload` hook is designed for gesture-safe access but may not be wired correctly.

- **Fix**: Ensure camera start is only triggered from the user's tap on the camera button, not from a `useEffect`.
- **File**: Relevant camera component (verify wiring)

**12. Video safety scan `currentTime` non-finite**

In `extractVideoFrame`, line 117 sets `video.currentTime = Math.min(timeSeconds, video.duration * 0.3)`. If `video.duration` is `NaN` or `Infinity` (common before metadata loads), the result is non-finite.

- **Fix**: Guard the assignment: `const seekTime = Math.min(timeSeconds, (video.duration || 2) * 0.3); if (!isFinite(seekTime)) seekTime = 0;`
- Also change the event from `onloadeddata` to `onloadedmetadata` which guarantees `duration` is available.
- **File**: `src/lib/aiSafetyClient.ts`

### Files to change

| # | File | Change |
|---|------|--------|
| 1 | `src/pages/Explore.tsx` | Pin tab bar to top |
| 2 | `src/pages/FriendMap.tsx` | Remove extra top padding |
| 3 | `src/components/reactions/ReactionPicker.tsx` | Portal + vertical mode + stable position |
| 4 | `src/components/posts/MobileShortCard.tsx` | Pass `vertical` to ReactionPicker |
| 5 | `src/components/chat/QuickAddRow.tsx` | Lock horizontal touch |
| 6 | `src/components/chat/MutualFriendsQuickAdd.tsx` | Lock horizontal touch |
| 7 | `src/pages/VybeDNA.tsx` | Fix sticky header |
| 8 | New migration SQL | Recreate `add_user_xp` 2-arg + 3-arg, fix `track_daily_login` to pass auth ID |
| 9 | `src/components/call/CallSettingsSheet.tsx` | Move `getUserMedia` to click handler |
| 10 | Camera component | Verify gesture-safe camera start |
| 11 | `src/lib/aiSafetyClient.ts` | Guard `currentTime` against non-finite values |

