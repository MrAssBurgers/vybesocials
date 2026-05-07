## 1. FAB "fall down" animation (Friend Link + VYBE Designer)

**Problem:** Right now both FABs fade to opacity-0 while only translating `translate-y-28`. Because opacity drops in parallel with the slide, you see them dissolve mid-air instead of falling cleanly off-screen. They also don't always feel synchronized.

**Fix in `src/components/friends/AutoFriendDrop.tsx` and `src/components/ai/VYBECommandBar.tsx`:**

- Replace the hide state with a real "fall off-screen" transform:
  - Hidden: `translate-y-[200%] opacity-100` (button stays fully opaque while falling, then is simply below the viewport — invisible to the user).
  - Visible: `translate-y-0 opacity-100`.
- Use an `ease-in` curve when hiding (gravity feel) and `ease-out` (spring-ish) when showing so they "fly back" upward into place.
- Keep `pointer-events-none` + `invisible` only **after** the fall completes (apply via a short `setTimeout`/`transitionend`, or simply gate `pointer-events` on `controlVisible` while leaving `invisible` off so the transition still plays).
- Use the same `duration-[280ms]` on both components so they drop in lockstep.
- For `VYBECommandBar`, switch the framer-motion `animate` to drive `y` (e.g. `y: controlVisible ? 0 : 160`) with matching transition + same duration, removing the opacity drop.

Result: both buttons fall straight down together, are completely gone while nav is hidden, and spring back up in unison when the nav returns.

## 2. DM header — shrink left pill so typing/presence has room

In `src/components/chat/ChatView.tsx` around line 1275–1363:

- Remove `flex-1` from the left pill wrapper (line 1277). Change it to `max-w-[60%]` (or `w-fit`) and let the inner name/presence area still `truncate` inside its own width.
- Set the outer `<header>` to `justify-between` (already is by default with the gap layout — confirm: change wrapper to `flex items-center justify-between`).
- Add a small `mr-2` after the left pill so it visually ends a bit past the username, leaving breathing room for the `LivePresenceBar` typing animation to expand without being clipped by the frosted glass edge.
- Keep the right pill `flex-shrink-0` so it stays anchored top-right.

Result: left pill hugs avatar + name + presence text, frosted glass ends just past the username, leaving open canvas in the middle of the header.

## 3. Floating "liquid glass" composer (bottom bar)

In `src/components/chat/ChatView.tsx` around line 1973:

- Replace the current container styling:
  ```
  <div className="flex-shrink-0 border-t border-border bg-background sticky bottom-0 z-30 relative">
  ```
  with a transparent floating wrapper:
  ```
  <div className="flex-shrink-0 sticky bottom-0 z-30 bg-transparent px-2 sm:px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
  ```
- Wrap the inner `px-2 py-2 ...` row (line 1983) in a single rounded "pill" container that mirrors the header style:
  ```
  rounded-3xl bg-background/40 backdrop-blur-2xl backdrop-saturate-150
  border border-white/10 ring-1 ring-inset ring-white/[0.04]
  shadow-[0_8px_24px_-10px_rgba(0,0,0,0.6)]
  px-2.5 py-2
  ```
- Drop the hard `border-t` so the chat scroll content blurs through underneath the composer (matching the header's glass-over-content effect).
- Keep Toybox / input / send buttons inside the pill exactly as today; only the chrome changes.

Result: the bottom row (Toybox → text input → snap/record/send) sits inside one floating frosted-glass pill that mirrors the top header, with chat content visibly blurring beneath it as you scroll.

## Files touched

- `src/components/friends/AutoFriendDrop.tsx` — fall animation
- `src/components/ai/VYBECommandBar.tsx` — fall animation (motion `y`)
- `src/components/chat/ChatView.tsx` — left header pill width + composer glass pill

No DB / native / edge function changes — pure UI, no Despia rebuild required.
