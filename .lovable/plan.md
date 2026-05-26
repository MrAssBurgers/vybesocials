# Snapchat-style Save + Polish Pass

All backend work is already in place (good news):
- DM messages auto-expire 48h after being opened (`expires_at` trigger)
- `toggle_saved_message` RPC flips save state and clears/resets `expires_at`
- `cleanup_expired_messages()` cron job soft-deletes expired messages

So this pass is **purely frontend**: wire up tap-to-save, polish UI, fix two bugs, and add the onboarding mention.

## 1. ReceivedThemeSheet — scroll fix

File: `src/components/themes/ReceivedThemeSheet.tsx`

- The portaled overlay sits inside `data-dm-active` chat which uses fixed positioning + locked body scroll, so the inner `overflow-y-auto` panel can't intercept touch.
- Add `.page-scroll-fix` class to the outer fixed container (same class used elsewhere to bypass the DM scroll lock).
- Ensure the scroll container has `-webkit-overflow-scrolling: touch`, `touch-action: pan-y`, and `overscroll-behavior: contain` (already present, verify).
- Add `e.stopPropagation()` on `onTouchStart`/`onTouchMove` of the scroll region so the chat's swipe handlers don't steal the gesture.

## 2. DMHoldMenu — fit all contents

File: `src/components/chat/DMHoldMenu.tsx`

Currently a 260px card centered vertically with `max-h-[80vh]`; when many rows are visible (Reply, Save, Copy, Save media, Save Sticker, Edit, Unsend, Delete-for-me + emoji row) some items get cut and the emoji bar overflows horizontally on narrow screens.

- Widen to `min(300px, calc(100vw - 24px))`.
- Make the emoji row `flex-wrap` with `gap-1.5` and `justify-around`, so 6 emojis always fit on 320px screens.
- Shrink row vertical padding from `py-2.5` → `py-2`, font from `text-[13px]` → `text-[12.5px]`, icon `h-4 w-4` → `h-3.5 w-3.5`.
- Anchor with `top-[10vh]` instead of `top-1/2 -translate-y-1/2`, and use `max-h-[80vh] overflow-y-auto` so even long menus stay scrollable inside the card.
- Add `overscroll-contain` to the scroll body.

## 3. Tap-to-save (Snapchat parity)

File: `src/components/chat/ChatView.tsx` (the `MessageBubble` render block, around the bubble wrapper that already handles long-press for the hold menu).

Goal: a **short tap** on any DM bubble (text, image, video, voice, note) toggles save; long-press still opens the DMHoldMenu; existing controls (play, reactions, reply swipe) keep working.

Implementation:
- Reuse the existing `onToggleSaved` callback already passed into `MessageBubble`.
- Add `onPointerDown`/`onPointerUp` handlers on the bubble wrapper:
  - On down: record timestamp + start position.
  - On up: if `duration < 250ms` AND pointer moved `< 8px` AND no long-press fired → call `onToggleSaved()` and trigger a save animation.
  - Ignore taps that originated on interactive children (buttons, audio controls, video play icon) via `e.target.closest('[data-no-tap-save]')`.
- Disable tap-to-save for group chats (mirrors current `onToggleSaved` gating — already `!isGroupChat`).
- Disable for the user's own ephemeral system bubbles (theme share bubble already calls `e.stopPropagation()` so it won't trigger).
- Fire light haptic on toggle (`navigator.vibrate?.(8)`).

## 4. Saved badge + animation

File: `src/components/chat/ChatView.tsx` (bubble render).

- Replace the current verbose "You saved" / "They saved" footer text with a **subtle bookmark badge**: small filled `Bookmark` icon (10px), inside a pill `bg-primary/15 text-primary border border-primary/30 rounded-full px-1.5 py-0.5`, anchored bottom-right of the bubble using `absolute -bottom-1 -right-1`.
- Animation: wrap the badge in Framer Motion `<AnimatePresence>`; `initial={{ scale: 0, rotate: -30, opacity: 0 }}`, `animate={{ scale: 1, rotate: 0, opacity: 1 }}`, `exit={{ scale: 0, opacity: 0 }}`, spring `stiffness: 400, damping: 18`.
- On save toggle, also briefly pulse the bubble itself (`animate={{ scale: [1, 1.04, 1] }}` `duration: 0.3`).
- Keep current Snapchat-style border (`message.saved_by_sender || message.saved_by_recipient` → border treatment already exists on line 2503) but soften to `border-primary/40`.
- Show "Saved" tooltip on long-press hover only — remove the inline text row.

## 5. Onboarding mention of 48h auto-delete

File: `src/components/onboarding/PrivacySettings.tsx` (already in flow).

- Add a small info card near the existing privacy items:
  > **Disappearing Messages** — DMs delete from the chat and our servers 48 hours after you open them. Tap any message to save it forever. Tap again to unsave.
- Use icon `Clock` + `Bookmark`, glass card matching the existing privacy items.

## Verification

After implementation:
- Open shared theme bubble in a DM → bottom-sheet scrolls smoothly on mobile.
- Long-press DM bubble → menu shows all rows, nothing clipped at 384px viewport.
- Single-tap a text bubble → bookmark badge animates in; tap again → it animates out. Long-press still opens menu; reply-swipe still works.
- Walk through onboarding → new disappearing-messages card appears in PrivacySettings step.

## Out of scope

- No backend changes (trigger, RPC, cron all already exist).
- No changes to group chat save semantics.
- No changes to the existing VYBE (24h media) flow.
