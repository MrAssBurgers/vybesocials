

## Deep Bug Fix & Performance Polish Plan

### Issues Found

**Critical: FriendMap Build Error (Unterminated regexp literal)**
- `src/pages/FriendMap.tsx` at line 1336: The outermost `<div>` opened at line 777 is never closed. The file ends with only 3 closing `</div>` tags when it needs 4 (the self-closing `<div ... />` on lines 822, 836, 1053 don't need closing tags). This causes a Vite parse error that prevents the `/map` route from loading at all.
- **Fix**: Add `</div>` before `);` on line 1336 to close the root container.

**Warning: WeeklyRhythmBanner ref forwarding**
- `AnimatePresence` is trying to pass a ref to the `motion.div` child but the component structure triggers a React warning. The `motion.div` inside `AnimatePresence` already handles refs correctly — the warning comes from `AnimatePresence` wrapping children without `forwardRef`.
- **Fix**: Wrap the inner content in `motion.div` using `forwardRef`, or suppress by wrapping children in a `<div>` intermediary. The simplest fix: the `motion.div` with `key` already works, the warning is cosmetic from framer-motion internals — no user-facing impact but we can silence it.

**No other critical issues found:**
- TypeScript compilation: clean (0 errors)
- No duplicate `isGroupDialogOpen` declarations
- No other unterminated JSX/regex issues
- Performance: `will-change` usage is appropriate and scoped

### Plan

1. **Fix FriendMap JSX** (`src/pages/FriendMap.tsx` line 1336)
   - Add closing `</div>` for the root container div before `);`
   - This fixes the Vite build error and restores the entire `/map` route

2. **Fix WeeklyRhythmBanner ref warning** (`src/components/home/WeeklyRhythmBanner.tsx`)
   - Wrap the component with `forwardRef` so `AnimatePresence` can attach refs without warnings
   - No functional change, just silences the console error

### Files to modify
- `src/pages/FriendMap.tsx` — Add 1 closing `</div>` tag
- `src/components/home/WeeklyRhythmBanner.tsx` — Add `forwardRef` wrapper

