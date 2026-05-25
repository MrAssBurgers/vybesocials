## Goal

1. Make the splash "Waking up…" progress bar look clean (not squished).
2. Polish the VybePass / BattlePass level progress card so the bar feels premium.
3. Replace the plain spinner on the Landing login button with a polished, on-brand loading animation.
4. When the device comes back online, repaint the **entire** app immediately — no stale data, no manual refresh — without a hard page reload.

---

## 1. Splash progress bar — `src/components/ui/SplashScreen.tsx`

Currently a 3px hairline that on a 384px viewport looks like a thin squashed line.

- Widen the bar container from `w-[min(12rem,60vw)]` to `w-[min(16rem,72vw)]` so it has proper presence.
- Increase track height from `3px` to `6px`, keep `rounded-full`, raise track contrast to `bg-foreground/[0.1]`.
- Add a soft inner glow on the fill (drop shadow with `--primary` at 35% alpha) and a subtle moving sheen so empty/early-progress states still feel alive.
- Add a tiny `‎%` label spacing fix (status + percent row): bump font-size from `[11px]` to `[12px]`, use `text-foreground/80` for the percent so it's readable.
- Keep the existing `barRef` `scaleX` mechanic (no re-render churn).

## 2. VybePass / BattlePass level card — `src/components/ui/progress.tsx` + the two cards

Both `BattlePassProgress.tsx` and `VybePassProgress.tsx` use the shadcn `<Progress>`. The bar today is a flat solid primary fill that looks dated next to the rest of the card.

- In `src/components/ui/progress.tsx`, add an optional `variant?: 'default' | 'reward'` prop. The `reward` variant renders the indicator as a gradient (`from-primary via-accent to-primary`), adds `shadow-[0_0_12px_hsl(var(--primary)/0.45)]`, and uses a 600ms `cubic-bezier(0.22,1,0.36,1)` transition.
- Tighten the bar height in both cards: the compact row uses `h-2` (up from `h-1.5`) and the expanded view uses `h-2.5` (up from `h-2`) with `rounded-full`.
- Pass `variant="reward"` from `BattlePassProgress` and `VybePassProgress`.
- Keep all colors as design tokens (no hardcoded hex).

## 3. Login button animation — `src/pages/Landing.tsx`

The submit button currently swaps the label for a basic rotating ring.

- Replace the loading state with a layered animation:
  - Three pulsing dots (staggered `0`, `0.15s`, `0.3s` delay) using `bg-white` at 90% alpha, sized `h-2 w-2`, animated via Framer Motion `animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}` with `repeat: Infinity, duration: 0.9, ease: 'easeInOut'`.
  - Keep button height stable (`min-h-[44px]`) so it doesn't jump on state change.
  - Wrap the label/dots swap in `AnimatePresence mode="wait"` with `fade-in / fade-out` (`0.2s`) so the transition reads as intentional, not abrupt.
- Apply the same swap to the signup branch (same button).
- No business-logic changes — purely the visual loading state.

## 4. Instant full refetch on reconnect — `src/lib/reconnectManager.ts`

The reconnect probe already exists, but `fireReconnect` only refetches **stale** active queries, so DMs/feed/notifications often wait until their own staleTime expires before repainting after a reconnect.

- In `fireReconnect`, change the invalidate call to:
  - `queryClient.invalidateQueries({ refetchType: 'active' })` (drop the `isStale()` predicate) so every mounted query refetches the moment we confirm connectivity is back.
  - Also call `queryClient.resumePausedMutations()` so any DM sends/reactions queued while offline flush right away.
- Add a one-time `queryClient.refetchQueries({ type: 'active' })` fallback right after invalidate to cover queries that opted out of `refetchOnReconnect`.
- Drop the offline-poll floor from `OFFLINE_MIN_MS = 3000` to `1500` so detection of "we're back" happens within ~1.5s instead of 3s.
- Keep the user-listener (`onReconnect`) so feature hooks (chat presence, realtime channels) can also re-bind.

No page reload, no flicker — every component repaints with fresh data within ~1–2s of the network returning.

---

## Files touched

- `src/components/ui/SplashScreen.tsx` — thicker, wider, glowing splash bar
- `src/components/ui/progress.tsx` — add `reward` gradient variant
- `src/components/battlepass/BattlePassProgress.tsx` — use new variant, bump heights
- `src/components/vybepass/VybePassProgress.tsx` — use new variant, bump heights
- `src/pages/Landing.tsx` — replace spinner with 3-dot bounce inside `AnimatePresence`
- `src/lib/reconnectManager.ts` — refetch ALL active queries + faster offline poll

## Out of scope

- No changes to auth flow, RLS, edge functions, or data model.
- No changes to colors outside the existing semantic tokens.
