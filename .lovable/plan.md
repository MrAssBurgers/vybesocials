
The user wants to fix contrast on the DM section by adding theme-aware frosted glass to:
1. The empty state ("Select a conversation" panel — desktop only)
2. The conversation list panel (left sidebar)

Currently `Messages.tsx` uses `backgroundColor: 'hsl(var(--card))'` which is a flat solid color — no glass, and contrast against the wallpaper/background may be off in light mode.

I need to check the ConversationList component too to see what surface it sits on.

## Plan

Apply a theme-aware frosted glass surface to the DM shell in `src/pages/Messages.tsx` and ensure text inside auto-adjusts for contrast.

### Changes

**1. `src/pages/Messages.tsx`**
- Replace the flat `backgroundColor: 'hsl(var(--card))'` on the outer DM container with a frosted glass layer that works in both themes:
  - Dark mode: `bg-background/60` + `backdrop-blur-xl` + subtle white border
  - Light mode: `bg-background/70` + `backdrop-blur-xl` + subtle dark border
  - Achieved via a single class set using existing theme tokens (`bg-background/65 backdrop-blur-2xl`) — tokens already flip per theme.
- Add a faint inner border between the conversation list and chat panel using `border-border/50` instead of solid `border-border` so it reads as glass-on-glass.
- Empty state ("Select a conversation"):
  - Wrap the centered content in a frosted glass card (`liquid-glass-depth` from `src/styles/liquid.css`, which is already theme-aware via `--glass`, `--primary`, `--accent` tokens).
  - Use `text-foreground` for the heading and `text-muted-foreground` for the subtitle — both auto-flip per theme for WCAG-safe contrast.
  - Keep the gradient text effect but ensure the gradient stops use `from-foreground to-foreground/70` (already correct).

**2. `src/components/chat/ConversationList.tsx`** (read first, then minimal patch)
- Make its root background transparent (or `bg-transparent`) so the frosted glass from the parent shows through, instead of stacking another opaque surface on top.
- If the list rows have their own backgrounds, switch them to `bg-card/40 hover:bg-card/60` so they feel like glass tiles on glass.
- Confirm row text uses `text-foreground` / `text-muted-foreground` (semantic tokens), not hardcoded colors.

### Why this works for contrast
All changes use the semantic theme tokens (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--card`) which are already defined for both `.dark` and `.light` in the design system. That means text contrast auto-adjusts per theme without any conditional logic. The frosted layer uses opacity on `--background` so the wallpaper shows through but text stays readable.

### Out of scope
- The actual `ChatView` (active conversation thread) — user said "mainly the list and empty state."
- Mobile DM overlay — already has its own `data-dm-active` isolation and looks fine.
- No new files. No DB changes. No new packages.

### Files
1. `src/pages/Messages.tsx` — swap solid bg for frosted glass; wrap empty state in glass card
2. `src/components/chat/ConversationList.tsx` — make root transparent so glass shows through; soften row backgrounds
