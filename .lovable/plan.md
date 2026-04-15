

## Visual Polish Pass + Home Feed Scroll Fix

Two focus areas: fixing the broken immersive feed scrolling, and polishing key surfaces to create that "wow" first impression.

---

### 1. Fix Home Feed Scrolling (Immersive Mode)

**Problem**: `ImmersiveFeedMode` uses a hardcoded `h-[calc(100vh-140px)]` that doesn't match the actual layout. The mobile layout has a 56px header (`h-14`) + bottom nav with safe areas, and uses `100dvh` elsewhere. The snap scroll container height mismatches the card heights, causing cards to get cut off and scroll to feel janky.

**Fix**:
- Remove the immersive snap-scroll mode entirely — it's a secondary view toggle that conflicts with the normal infinite scroll feed and causes the cut-off bug
- Remove the `ImmersiveToggle` button from the feed tab bar
- The normal list feed already works well with the infinite scroll observer and pull-to-refresh
- This eliminates the snap-scroll container nesting problem entirely

**Files**: `src/components/home/HomeWidgetRenderer.tsx`, `src/components/home/ImmersiveFeedMode.tsx`

---

### 2. Greeting Widget — Premium Welcome Header

**Current**: Plain text "Good morning, @username" with a small activity ticker below. Functional but flat.

**Upgrade**:
- Add a subtle animated gradient accent line below the greeting (primary → accent, 2px, slow shimmer)
- Show the user's avatar next to the greeting with a level badge overlay
- Add a "current vibe" emoji if they have a Vibe Check active
- Typography upgrade: lighter weight on "Good morning" (font-medium), bolder on username (font-black), creates visual hierarchy

**Files**: `src/components/home/GreetingWidget.tsx`

---

### 3. Feed Tab Bar — Floating Capsule Upgrade

**Current**: The tab bar is `bg-card/60 backdrop-blur-xl` with a motion pill indicator. It works but looks like a standard tab bar.

**Upgrade**:
- Make the active tab indicator a neon-glow capsule with a soft box-shadow pulse (`shadow-[0_0_20px_hsl(var(--primary)/0.25)]`)
- Add a tiny dot indicator on tabs that have unread/new content
- Subtle parallax tilt on the active capsule using `perspective` and `rotateX` on hover

**Files**: `src/components/home/HomeWidgetRenderer.tsx`

---

### 4. Post Cards — Depth & Micro-interactions

**Current**: PostCards are clean but every social app has them. No distinctive visual signature.

**Upgrade**:
- Add a subtle left-edge accent bar (3px, rounded, gradient from primary/30 to transparent) — gives cards a distinct "VYBE" signature
- Smooth entrance animation: staggered `opacity` + `translateY(8px)` as cards enter viewport (using the existing IntersectionObserver pattern)
- Double-tap heart: add a brief scale pop on the heart icon (0.9→1.2→1.0) with haptic

**Files**: `src/components/posts/PostCard.tsx`

---

### 5. XP Streak Widget — Alive & Glowing

**Current**: Small bar with flame icon, level text, and a basic progress bar. Functional but easy to ignore.

**Upgrade**:
- Animated flame icon that flickers (subtle scale oscillation) when streak > 0
- Progress bar gets a gradient fill (primary → accent) with a moving shimmer highlight
- The whole widget pulses softly once on mount to draw attention

**Files**: `src/components/home/XPStreakWidget.tsx`

---

### 6. "You're All Caught Up" Screen — Celebration Moment

**Current**: Basic checkmark in a circle with text. Boring — this is a reward moment.

**Upgrade**:
- Animated checkmark that draws itself (SVG path animation)
- Confetti burst (reuse existing `Confetti` component) on first appearance
- Gradient text on "You're all caught up" (primary → accent)
- Fun rotating emoji (🎉) next to the title

**Files**: `src/components/home/CaughtUpScreen.tsx`

---

### Technical Summary

**Files modified** (6 files):
- `src/components/home/HomeWidgetRenderer.tsx` — Remove immersive toggle, upgrade tab bar glow
- `src/components/home/ImmersiveFeedMode.tsx` — Delete or gut (no longer used)
- `src/components/home/GreetingWidget.tsx` — Avatar + gradient accent + typography hierarchy
- `src/components/posts/PostCard.tsx` — Left accent bar + entrance animation
- `src/components/home/XPStreakWidget.tsx` — Animated flame + shimmer progress
- `src/components/home/CaughtUpScreen.tsx` — SVG draw animation + confetti + gradient text

**No database changes needed. No functionality removed — everything is purely visual polish.**

