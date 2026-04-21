

## Goal
Strip the gray/yellow frosted overlay from the bottom nav, fix the inverted Ghost Mode toggle, and make the friend selector show all friends (not just those currently sharing location).

## Fix 1 — Bottom nav: remove the tinted overlay
`src/components/layout/BottomNav.tsx` (lines 515–530)

The "weird gray/yellow background" is this gradient layered on top of the card:
```
linear-gradient(135deg, hsl(var(--primary)/0.15), hsl(var(--accent)/0.1)), hsl(var(--card))
```
With the current theme, `--primary`/`--accent` render warm → that yellow/gray haze in the screenshot.

Change the non-edit-mode background to a clean solid card with a subtle border only:
- Background: `hsl(var(--card))` (no gradient overlay).
- Keep the border `border-white/10` and the soft drop shadow.
- Edit mode keeps its primary glow (intentional, signals active state).

Result: bottom nav is a clean dark pill — no yellow tint, no frosted overlay behind icons.

## Fix 2 — Ghost Mode toggle: correct ON/OFF
`src/pages/FriendMap.tsx` (lines 1017–1030)

Toggle currently uses `!sharing` for both color and knob position, so when location is ON the switch reads as OFF (the screenshot shows white knob right + gray track while "location is visible"). Invert:
- Track: `sharing ? 'bg-primary' : 'bg-white/20'`
- Knob: `sharing ? 'translate-x-7' : 'translate-x-1'`

Now: sharing ON = knob right + primary track. Ghost Mode (sharing OFF) = knob left + gray track. Matches the subtitle text.

## Fix 3 — Friend selector shows everyone
`src/pages/FriendMap.tsx` (lines 468–470, ~1070)

`allFriendsArr` filters out friends without valid lat/lng, so friends who haven't shared location can't be selected for "Friends, Except…" / "Only These Friends…". That's the root cause of "can't select certain people."

Change:
- Build a separate `selectableFriendsArr` from the raw `friends` list with no lat/lng filter (still requires `user_id`).
- Use it for the per-friend visibility list and the gating check on line 1070.
- Keep `friendsArr` (lat/lng filtered) for map markers — unchanged.

Also fix the per-friend toggle visual logic so semantics match the section:
- In `only-these` mode, "selected" should mean visible (not hidden). Current code treats `hiddenFriends` as the universal store, which inverts meaning in `only-these` mode.
- Add a derived `isVisibleToFriend(friendId)` that returns:
  - `friends-except`: `!hiddenFriends.has(id)`
  - `only-these`: `hiddenFriends.has(id)` is repurposed as "included" — rename storage to `selectedFriends` for `only-these` and keep `hiddenFriends` for `friends-except`, OR cleanest: introduce a single `allowedFriends` set used only in `only-these` mode and persist it under a new localStorage key.
- Toggle button colors and ON-position reflect "included/visible" consistently.

## Files edited
- `src/components/layout/BottomNav.tsx` — solid card background, no gradient tint.
- `src/pages/FriendMap.tsx` — fix toggle direction, add `selectableFriendsArr`, split `hiddenFriends` vs `allowedFriends` state with proper toggle semantics.

## Expected result
- Bottom nav: clean dark pill, no yellow/gray haze, icons sit on solid card.
- Ghost Mode switch: knob + color match the "visible/hidden" label.
- Friend selector: lists every friend (not just those sharing GPS); toggles correctly include/exclude per mode.

