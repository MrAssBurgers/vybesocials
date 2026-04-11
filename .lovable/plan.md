

## Fix: Decouple Long-Press Menu from Swipe-to-Reply + Redesign Menu

### Problems
1. **Long-press is wired through SwipeToReply** — the `onLongPress` callback lives inside `SwipeToReply`, so the menu only triggers during swipe gestures. It should be completely independent.
2. **Menu is too large and centered** — the current full-screen centered overlay with message preview, emoji bar, and large action card is bloated. It should be a compact, clean frosted glass card anchored near the held message.

### Fix: Two changes

#### 1. Move long-press detection OUT of SwipeToReply

- **Remove** `onLongPress` prop from `SwipeToReply` entirely — strip all long-press logic (pointer capture handlers, gesture state machine, timers) from that component. SwipeToReply should ONLY handle horizontal swipe-to-reply.
- **Add long-press directly on MessageBubble** — inside the `MessageBubble` component (around line 2122 in ChatView.tsx), add a simple `onPointerDown`/`onPointerMove`/`onPointerUp` long-press detector on the bubble's root `div` (the one with `data-message-id`). This completely decouples the two gestures.
- **Update the SwipeToReply usage** at line 1508 — remove the `onLongPress` prop.

#### 2. Redesign the menu — compact, top-left anchored, clean

Replace the current full-screen centered overlay (lines 2548-2679) with:
- **Backdrop**: Keep the `fixed inset-0 backdrop-blur-md bg-black/40` (lighter blur than current)
- **Menu card**: A compact frosted glass card (`backdrop-blur-xl bg-black/60 border border-white/10 rounded-xl`) positioned near the top-left of the message bubble using the bubble's bounding rect
- **No message preview** — remove the giant message snapshot, it's unnecessary
- **No emoji bar in the overlay** — keep it separate or remove from this menu
- **Compact action list**: Small text (text-[13px]), tight padding (px-3 py-2.5), icons at 14px — like Snapchat's minimal popup
- **Max width ~180px**, clean separators

### Files Touched

| File | Change |
|------|--------|
| `src/components/chat/SwipeToReply.tsx` | Remove all long-press logic, keep only swipe-to-reply |
| `src/components/chat/ChatView.tsx` | Add standalone long-press on MessageBubble div; redesign context menu to compact top-left anchored glass card |

