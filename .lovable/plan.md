# Hold-to-Share Quick Menu

Add an Instagram/TikTok-style long-press menu on the share button that pops up the user's 4 most-talked-to people. User drags onto an avatar (haptic on hover), releases to instantly DM the post.

## What's built today
- `ShareButton.tsx` — tap opens dropdown (Share / Copy / QR). No long-press.
- `ShareSheet.tsx` — full bottom sheet with quick friends + multi-send DM logic (already does the actual conversation lookup + message insert at lines ~150-175).
- `shareRecency.ts` — `getShareRankedUserIds()` returns IDs ranked by share frequency + recency. Perfect data source for the "top 4".
- `recentMessageUsers.ts` — also tracks recent DM recipients with full profile cached.
- `DMHoldMenu.tsx` — reference pattern for portal + long-press radial menus (backdrop guard, haptic, framer-motion spring).
- `haptics.ts` — `triggerHaptic('light' | 'medium' | 'success')` ready to use.

## New component: `QuickShareHoldMenu.tsx`

Location: `src/components/share/QuickShareHoldMenu.tsx`

Behavior:
1. **Trigger:** wraps any share button. On `pointerdown`, start 350ms timer. If pointer released before timer → fall through to normal click (existing share dropdown). If timer fires → open the radial/horizontal menu, fire `triggerHaptic('medium')`, prevent the click.
2. **Menu UI:** portal-rendered floating bar anchored above the button (or auto-flipped if near top). Pill-shaped glass card (`liquid-glass` style matching DMHoldMenu) with:
   - 4 circular avatars (the top 4 talked-to friends)
   - Each avatar ~52px, name label below in 10px text
   - Subtle "Send to…" hint label above the row
3. **Drag tracking:** while pointer is held, track `pointermove`. Use `document.elementFromPoint(x,y)` against avatars tagged with `data-quick-share-target={userId}`. On hover-enter of a new avatar:
   - scale that avatar to 1.18, add primary ring
   - fire `triggerHaptic('light')` (debounced — only on enter, not on every move)
4. **Release:**
   - If released over an avatar → `triggerHaptic('success')`, animate avatar with a quick paper-plane shoot-off (reuse the existing flyingPlanes pattern from ShareSheet), call shared `sendShareToUser(userId, postId)` helper, toast "Sent to {name}".
   - If released outside → menu closes silently with light haptic.
5. **Cancel:** pointer leaves window or `Escape` → close.

## Source of the top 4 friends

New helper `getQuickShareTargets()` in `src/lib/shareRecency.ts`:
- Take `getShareRankedUserIds()` first.
- Fall back / fill remainder with `getRecentMessageUsers()`.
- Hydrate any missing profile rows via a single `profiles` select (`id, username, display_name, avatar_url`).
- Return up to 4. If user has 0 history yet → fall back to first 4 from `useFriends()` (online first if cheap, else alphabetical). If still empty → don't render the hold menu, just keep tap-only behavior.

## Reusable send helper

Extract the conversation-lookup + message-insert that ShareSheet does (around lines 150-175) into `src/lib/sendShareToUser.ts`:
```
sendShareToUser({ userId, postId, postType, caption, mediaUrl, currentUserId })
```
ShareSheet refactors to call this; QuickShareHoldMenu uses the same. Also calls `recordShareTo(userId)` so the top-4 stays adaptive.

## Wiring `ShareButton.tsx`

Wrap the trigger `Button` with the new `QuickShareHoldMenu`:
- Pass `postId`, `postType`, `caption`, `mediaUrl` (extend ShareButton props — they're not there today; add as optional, only enable hold menu when `postId` is present).
- When `postId` is absent (e.g. the generic profile share), keep current dropdown-only behavior.
- Update the few call sites that pass post context to forward it.

## Touch + accessibility notes
- Use `pointer` events (works for mouse + touch) with `touch-action: none` on the trigger only while menu is open, so vertical scroll isn't hijacked during the 350ms grace window.
- On desktop: still works; long-press with mouse opens it. Right-click is unchanged.
- Respect `prefers-reduced-motion` for the spring + plane animations (fall back to fade).
- Honor existing haptics opt-out (already handled inside `triggerHaptic`).

## Files

Create:
- `src/components/share/QuickShareHoldMenu.tsx`
- `src/lib/sendShareToUser.ts`

Edit:
- `src/components/share/ShareButton.tsx` — wrap trigger, add optional post props
- `src/lib/shareRecency.ts` — add `getQuickShareTargets()`
- `src/components/share/ShareSheet.tsx` — refactor send to use shared helper (no UX change)
- Call sites that render `<ShareButton />` for a specific post — pass `postId`/`postType` (search & update; ~handful of spots)

## Out of scope
- No DB migrations.
- No changes to message schema, RLS, or conversation creation logic — reusing what ShareSheet already does.
- Doesn't replace ShareSheet; tap = share menu, hold = quick send.
