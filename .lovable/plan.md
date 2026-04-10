

## Redesign: Snapchat-Style Frosted Glass Long-Press Menu

### Problem
The current long-press context menu is a plain `bg-background border` card centered on screen. It looks dated and "fixed to the message." The user wants a standalone Snapchat-style frosted glass menu that feels like its own premium overlay.

### Design (Snapchat Reference)
- Full-screen blurred backdrop (`backdrop-blur-xl bg-black/50`)
- The **message bubble itself** is shown floating in the center of the overlay (a preview of what you're acting on)
- Below it, a **frosted glass pill** with the action buttons — rounded, translucent, with subtle border
- Emoji reaction bar sits above the message preview as floating pills
- Smooth spring animations on entry/exit
- Tap anywhere on backdrop to dismiss

### Changes in `src/components/chat/ChatView.tsx` (lines 2548-2637)

**Delete** the entire current context menu block and **replace** with:

1. **Backdrop**: `fixed inset-0 backdrop-blur-xl bg-black/50` with fade animation
2. **Centered container** (flex column, items-center, justify-center):
   - **Emoji reaction row**: Horizontal row of emoji pills with frosted glass background, floating above the message
   - **Message preview**: A scaled-down clone/snapshot of the message bubble content (text or media thumbnail) inside a frosted card so the user knows what they're acting on
   - **Action menu**: Frosted glass card (`backdrop-blur-2xl bg-white/10 dark:bg-white/5 border border-white/20 rounded-2xl`) with vertically stacked action buttons — each with icon + label, subtle hover states, generous padding
3. **Destructive actions** (Unsend, Delete) get a separated section at the bottom with red text

### Styling Details
- Glass card: `backdrop-blur-2xl bg-white/10 border border-white/20 rounded-2xl shadow-2xl`
- Action rows: `px-4 py-3 text-sm font-medium flex items-center gap-3` with `hover:bg-white/10` 
- Separators: `border-white/10`
- Entry animation: scale from 0.85 + fade, spring physics
- Exit: scale to 0.9 + fade out, 150ms

### Files Touched

| File | Change |
|------|--------|
| `src/components/chat/ChatView.tsx` | Replace lines 2548-2637 with new Snapchat-style frosted glass menu |

No other files need changes. The trigger mechanism (long-press via SwipeToReply + context menu) stays the same. The desktop `MessageActionMenu` 3-dot dropdown also stays unchanged.

