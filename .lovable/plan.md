

## Combined: Bottom Nav Polish + Camera Declutter + Snapchat-Style Text Bar

### 1. Bottom Nav — Restore gradient + remove active dot

**File**: `src/components/layout/BottomNav.tsx`

- **Lines 533**: Change non-edit background from `'hsl(var(--card))'` back to `'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--accent) / 0.1)), hsl(var(--card))'`
- **Lines 257-264**: Delete the active glow dot `motion.div` with `layoutId="nav-glow-dot"`

### 2. Camera Declutter

**File**: `src/components/camera/VybeSnapCamera.tsx`

- **Remove HDR button** (lines 798-807) — decorative, does nothing
- **Remove Sound button** (lines 823-835) — not functional
- **Remove label text** under remaining tool buttons (Flash, Timer, Grid, Night) — icon-only, shrink to `w-9 h-9`
- **Remove category tabs** (lines 910-928) — non-functional clutter
- **Remove hint text** "Tap for photo · Hold for video" (lines 930-938)
- **Remove AR placeholder** from lens carousel (lines 872-877)
- **Shrink lens filter circles** from `w-12 h-12` to `w-10 h-10`

### 3. Snapchat-Style Full-Width Frosted Text Bar

**File**: `src/components/camera/VybeSnapEditor.tsx`

**The key change**: After the user finishes typing and confirms text, instead of placing a small draggable text block at an arbitrary (x, y), create a **full-width frosted glass bar** that stretches edge-to-edge across the image.

- The bar has `backdrop-filter: blur(24px)`, `background: rgba(0,0,0,0.35)`, `rounded-2xl`, and horizontal padding
- Text is centered inside, bold, with the user's chosen color/style
- The bar **only drags vertically** (`drag="y"` with `dragConstraints` clamped to the container ref) — it slides up and down but never leaves the image
- The y-position is stored as a percentage and clamped between 5% and 95%

**Input bar** (while typing): Stays the same frosted input UI but uses a `textarea` that auto-expands vertically for multi-line text.

**Canvas export update** in `renderOverlaysToCanvas`: Draw a semi-transparent full-width rectangle at the correct y-position with centered text — matching the on-screen appearance.

**Remove pulsing glow** on send button (lines 736-741) — replace with static shadow.

**Add "Send to" label** above the QuickSendRow for clarity.

---

### Files Modified (3)
1. `src/components/layout/BottomNav.tsx` — gradient restore, remove dot
2. `src/components/camera/VybeSnapCamera.tsx` — declutter (remove HDR, Sound, tabs, hint, AR, shrink filters)
3. `src/components/camera/VybeSnapEditor.tsx` — full-width frosted bar overlays with vertical-only drag, send button cleanup

No database changes.

