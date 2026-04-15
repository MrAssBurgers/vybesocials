

## Emoji Memory + Composer Redesign + Background Auto-Contrast

### Problem Analysis

1. **Emoji memory not working on posts**: `recordEmoji()` is only called in `ChatView.tsx` and `WordReactions.tsx` (DMs). The `ReactionPicker` component used on posts never calls `recordEmoji()`, so post reactions are never remembered.

2. **Composer screens look ugly**: The `MobilePostComposer` and `DesktopCreateStudio` use basic form layouts with plain inputs and flat styling. The screenshots show a cluttered layout with visible borders, plain caption textareas, and cramped tag areas on a dark background.

3. **No auto-contrast when custom background is uploaded**: `AppBackground` applies the image but never adjusts text/UI contrast. When a bright or colorful background is set, text can become unreadable.

---

### Changes

#### 1. Fix Emoji Memory for Post Reactions (`ReactionPicker.tsx`)
- Import `recordEmoji` from `@/lib/frequentEmojis`
- Call `recordEmoji(reaction.emoji)` in both `handleSelectReaction` and the `handlePointerUp` quick-tap path
- This ensures every reaction on posts/clips is remembered and surfaces in DM smart emoji rows

#### 2. Redesign MobilePostComposer (`MobilePostComposer.tsx`)
Transform from a flat form into a polished, immersive composer:
- **Header**: Frosted glass header with gradient accent line (reuse `aura-shift` keyframe)
- **Media preview**: Full-bleed behind a semi-transparent overlay instead of a bordered card — the media becomes the background of the compose screen
- **Caption area**: Floating translucent text area overlaid on the media (Instagram Stories-style), not a bordered textarea below
- **User identity row**: Compact pill with avatar + username + visibility selector inline
- **Tags section**: Redesigned as floating chips with a more compact input, grouped under a collapsible section to reduce visual clutter
- **AI Caption button**: Elevated as a gradient pill instead of a plain button

#### 3. Redesign DesktopCreateStudio (`DesktopCreateStudio.tsx`)
- Match the mobile redesign aesthetic on the right-side panel
- Add frosted glass card styling to the Post tab content area
- Caption textarea gets the same translucent floating style
- Tag chips get matching gradient styling

#### 4. Auto-Contrast for Custom Backgrounds (`AppBackground.tsx`)
- When a background image is applied, analyze its average luminance (sample canvas pixels)
- Set a CSS custom property `--bg-luminance` on `document.documentElement` (0-1 scale)
- Add CSS rules in `index.css`:
  - When `[data-has-bg-image="true"]`: add a semi-transparent dark overlay (`bg-background/70`) to content containers
  - Boost text contrast with `text-shadow` for foreground text
  - Cards/glass elements get increased `backdrop-blur` and darker `bg-card` opacity
- This ensures all text remains legible regardless of background brightness

---

### Technical Details

**Files modified:**
- `src/components/reactions/ReactionPicker.tsx` — Add `recordEmoji` call
- `src/components/create/MobilePostComposer.tsx` — Full visual redesign
- `src/components/create/DesktopCreateStudio.tsx` — Matching visual polish
- `src/components/layout/AppBackground.tsx` — Luminance detection + CSS property
- `src/index.css` — Auto-contrast utility classes for custom backgrounds

**No database changes needed.**

