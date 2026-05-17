## Bug

On the live site (desktop `/messages`), the conversation list panel and the "Select a conversation" empty‑state card only occupy the top half of the screen. The empty‑state card floats in the upper‑right of the chat pane and the list's right border stops mid‑page — everything below is empty black space.

Root cause: `src/pages/Messages.tsx` relies on a `h-full` chain (`AppLayout` main → `h-full` wrapper → Messages outer `h-full w-full flex`). In the desktop `noPadding` branch of `AppLayout` the inner `mx-auto w-full h-full` div has no defined flex context, and on the live build the main element's effective height collapses, so `h-full` resolves to the natural content height of the conversation list. The empty state then centers inside that short box, which sits at the top of the chat pane.

## Fix

Only change `src/pages/Messages.tsx` — no business logic, no AppLayout changes.

1. In the desktop (non‑immersive, non‑mobileListMode) branch, replace `h-full w-full` on the outer wrapper with an explicit viewport height so it no longer depends on the `h-full` chain:
   - className: `h-[100dvh] w-full flex max-w-full bg-background`
   - style: `{ overflow: 'hidden' }`
   - Keep the existing immersive (`100dvh fixed inset-0 z-50`) and mobileListMode (`fixed inset-x-0 top-14 bottom-0`) branches as-is.

2. Make both child panels true flex children of that full‑height row:
   - Conversation list column: keep `w-full md:w-80 lg:w-96 border-r ... flex-shrink-0 min-w-0 bg-card/30 backdrop-blur-xl`, add `h-full` and `min-h-0`, drop the inline `height: '100%'` (now redundant).
   - Chat column: keep `flex-1 min-w-0 ... flex flex-col`, add `h-full min-h-0`.

3. Re‑center the empty state reliably inside the chat column regardless of parent height:
   - Wrap the existing empty-state card in a `flex-1 flex items-center justify-center w-full h-full` container.
   - Keep the floating particles and `liquid-glass-depth` card untouched visually.

## Out of scope

- No changes to `AppLayout`, `ConversationList`, `ChatView`, realtime hooks, or DM send logic.
- Mobile DM view (`/messages/:id`) is unaffected — the `isImmersive` branch is untouched.

## Verification

- Desktop `/messages` (no conversation selected): conversation list panel and right empty‑state pane both span full viewport height; "Select a conversation" card is centered both horizontally and vertically in the chat pane.
- Desktop `/messages/:id`: chat view still fills the pane.
- Mobile `/messages` and `/messages/:id`: unchanged (immersive + mobileListMode branches untouched).
