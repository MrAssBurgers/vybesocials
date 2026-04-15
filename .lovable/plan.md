

## Full App Visual Polish Pass — Premium Finish

A sweep across all major surfaces to elevate the app from "good" to "wow, this feels like a $100M app." No functionality removed, purely visual refinements and micro-interaction upgrades.

---

### 1. Page Transition System — Smooth Cross-Fade Between Routes

**Current**: Pages pop in instantly with no transition. Feels abrupt.

**Upgrade**: Wrap the router outlet in an `AnimatePresence` with a subtle cross-fade + slight Y-shift (opacity 0→1, y: 6→0, 250ms). Every page change feels buttery smooth.

**File**: `src/App.tsx` (route wrapper)

---

### 2. Mobile Header — Frosted Glass Depth Upgrade

**Current**: `liquid-glass` with basic border. Looks flat.

**Upgrade**:
- Add a subtle bottom glow line (`h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent`) under the header
- Logo gets a gentle hover pulse on tap (scale 0.95→1.05)
- Notification bell gets a soft bounce animation when unread count > 0

**File**: `src/components/layout/MobileHeader.tsx`

---

### 3. Bottom Nav — Floating Island with Active Glow

**Current**: Already has gradient background and floating style. Solid foundation.

**Upgrade**:
- Active icon gets a subtle glow dot underneath (4px circle with `bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]`)
- Active icon scales up slightly (1.15x) with spring animation
- Inactive icons get a softer opacity (0.5 → 0.7 on hover)
- Add a subtle top-edge highlight line (`via-white/8`) for glass depth

**File**: `src/components/layout/BottomNav.tsx`

---

### 4. Stories Bar — Ring Animation Polish

**Current**: Story rings work but static.

**Upgrade**:
- Unviewed story rings get a slow rotating gradient animation (conic-gradient spinning 4s)
- "Add Story" button gets a dashed ring that pulses subtly
- Story avatars have a press-down scale (0.92) on tap for satisfying feedback

**File**: `src/components/stories/StoriesBar.tsx`

---

### 5. Profile Page — Hero Card Depth & Tab Glow

**Current**: Clean layout but tabs feel flat.

**Upgrade**:
- Active tab gets the same neon-glow capsule treatment as the home feed tabs
- Post grid items get a staggered entrance delay (existing `idx * 0.04` kept but add `scale: 0.95→1`)
- Empty states get a gentle floating animation on the icon

**File**: `src/pages/Profile.tsx`

---

### 6. Notifications Page — Swipe-to-Dismiss Polish

**Current**: Notification cards are functional glass cards.

**Upgrade**:
- Each notification card gets a staggered entrance animation (opacity + translateX from -10)
- Unread notifications get a subtle left-edge primary accent bar (2px)
- Time labels get a softer, smaller font treatment

**File**: `src/pages/Notifications.tsx`

---

### 7. Explore Page — Category Chips Spring Animation

**Current**: Category chips are static buttons.

**Upgrade**:
- Active chip gets a spring scale pop (1.0 → 1.05 → 1.0) on selection change
- Chip row gets a subtle parallax scroll effect
- Search input gets the `liquid-input-focus` treatment with glow on focus

**File**: `src/pages/Explore.tsx`

---

### 8. Settings Page — Section Headers & Divider Polish

**Current**: Functional but visually plain.

**Upgrade**:
- Section transitions use fade-in animation when switching tabs
- Active category in the nav gets a gradient accent indicator
- Add subtle divider lines with gradient fade (transparent → border/20 → transparent)

**File**: `src/pages/Settings.tsx`

---

### 9. Messages List — Conversation Card Hover States

**Current**: Basic list items.

**Upgrade**:
- Conversation cards get a subtle scale (1.01) on hover/press
- Unread conversations get a primary dot indicator that pulses gently
- Empty state gets the standard floating icon treatment

**File**: `src/pages/Messages.tsx`

---

### 10. Global CSS — Smooth Scroll & Selection Color

**Current**: Standard browser defaults for some interactions.

**Upgrade**:
- Add `::selection` color (primary/20 background)
- Add smooth scrollbar fade for all scroll containers
- Add a universal `@keyframes float` animation for reuse across empty states
- Add subtle focus-visible ring styling (primary/30) for keyboard navigation

**File**: `src/index.css`

---

### Technical Summary

**Files modified** (10 files):
1. `src/App.tsx` — Route transition wrapper
2. `src/components/layout/MobileHeader.tsx` — Bottom glow line, bell bounce
3. `src/components/layout/BottomNav.tsx` — Active glow dot, icon scaling, top highlight
4. `src/components/stories/StoriesBar.tsx` — Rotating ring, pulse add button
5. `src/pages/Profile.tsx` — Tab glow capsule, grid entrance
6. `src/pages/Notifications.tsx` — Staggered entrance, unread accent bar
7. `src/pages/Explore.tsx` — Chip spring, search glow
8. `src/pages/Settings.tsx` — Section fade transitions, nav indicator
9. `src/pages/Messages.tsx` — Card hover states, unread pulse
10. `src/index.css` — Selection color, float keyframe, focus ring, scrollbar

**No database changes. No features removed. Purely visual polish.**

