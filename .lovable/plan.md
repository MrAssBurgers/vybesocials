## Goal
1. Fix the mobile DM chat header (it's split into two overlapping pills — title pill collides with the call/video/menu pill) and tighten the composer so it sits flush above the bottom nav.
2. Introduce a single global keyboard‑avoidance system so every input (chat, comments, search, forms, captions, profile edit, etc.) automatically stays visible above the keyboard with consistent padding, on both iOS and Android (web + Despia).

## Part 1 — DM header + composer (mobile)

**Files**
- `src/components/chat/ChatHeader.tsx` (and/or `DMChatHeader` — confirm via grep)
- `src/components/chat/MessageComposer.tsx` (or equivalent — confirm)

**Changes**
- Header: collapse the two floating pills into a single full‑width header row: back · avatar · name/status (flex‑1) · call · video · menu. Remove the absolute‑positioned right pill. Use `pt-[max(env(safe-area-inset-top),var(--sat,0px))]` and `px-3` for proper notch spacing.
- Composer: remove duplicated outer pill wrapper, keep one rounded container, ensure it docks via the new keyboard system (no manual `bottom-[var(--kb-h)]` per‑screen offsets).

## Part 2 — Global keyboard avoidance

**New primitive**: `src/components/layout/KeyboardAvoidingLayout.tsx`
- Wraps `children` and renders a sticky bottom spacer sized to `--kb-h` (publishes via existing `useKeyboardHeight`).
- On focus of any `input`/`textarea`/`[contenteditable]` inside it, calls `scrollIntoView({ block: 'center', behavior: 'smooth' })` after the keyboard animation settles (uses `visualViewport` resize event + 60ms debounce).
- Maintains `--kb-safe-pad: 12px` constant for comfort padding above the keyboard.

**Wire-up**
- Mount once inside `src/components/layout/AppLayout.tsx` around the `<main>` scroll container so every route inherits it.
- Ensure `useKeyboardHeight()` is invoked at the app root (`src/App.tsx` already calls it — verify).
- Add CSS in `src/index.css`:
  ```css
  :root { --kb-h: 0px; --kb-safe-pad: 12px; }
  body[data-kb-open="true"] [data-keyboard-dock] {
    transform: translateY(calc(var(--kb-h) * -1));
    transition: transform 220ms cubic-bezier(.2,.8,.2,1);
  }
  ```
- Any element with `data-keyboard-dock` (composers, comment bars, sticky form footers) lifts above the keyboard automatically.

**Remove per‑screen handling**
- Audit and delete manual `bottom: var(--kb-h)` / `paddingBottom: keyboardHeight` blocks in:
  - `KeyboardAwareTexter.tsx` (slim down to just publish heights — keep, do not duplicate)
  - `CommentSheet.tsx`, `CommentComposer.tsx`
  - `MessageComposer.tsx`
  - Any `useKeyboardHeight()` consumer that re‑applies the inset
- Replace with `data-keyboard-dock` attribute.

**Focus scroll helper**: `src/lib/keyboardFocusScroll.ts`
- Single global `focusin` listener that ensures `e.target.getBoundingClientRect().bottom < innerHeight - kb - 12`; if not, scrolls its nearest scrollable ancestor.
- Installed once from `AppLayout` mount.

## Verification
- `npm run build`
- Manual: open DM on mobile preview → header is one clean row; composer sits above nav; focus input → keyboard pushes composer up smoothly; same behavior on comments sheet, search, profile edit, post composer caption.

## Out of scope
- Desktop layouts (untouched — `shouldTrackSoftKeyboard` already returns false).
- Native Capacitor keyboard plugin behavior (already handled in `useKeyboardHeight`).
