

## Full App Visual Refresh — Kill the Boring

After scanning every page and component, here are the areas that look generic/basic and the redesign plan for each.

---

### 1. NotFound Page — Full Cinematic 404
**Current**: Plain white `bg-muted` div with "404" text and an underlined link. Looks like a template.

**Redesign**: Immersive dark fullscreen with animated glitch effect on the "404" text, a floating VYBE logo with ambient glow, gradient mesh background, and a glassmorphic "Go Home" button. Add a subtle particle drift animation.

**File**: `src/pages/NotFound.tsx`

---

### 2. Home Feed Tab Bar — Glowing Capsule Selector
**Current**: Standard `TabsList` with muted background. The animated underline is nice but the container is flat `bg-muted/50`.

**Redesign**: Frosted glass capsule with inner glow on the active tab. Active tab gets a gradient fill (not just text color change) with soft neon shadow. The underline becomes a full capsule highlight that morphs between tabs using `layoutId`.

**File**: `src/components/home/HomeWidgetRenderer.tsx` (FeedSection)

---

### 3. "Customize Home" Button — Floating Gradient Orb
**Current**: Small outline button that says "Customize Home" with a grid icon. Easily missed.

**Redesign**: Morph into a floating glassmorphic pill with a subtle breathing animation and gradient border. Add a shimmer sweep effect. Make it feel premium, not utilitarian.

**File**: `src/pages/Home.tsx`

---

### 4. Empty States — Illustrated Glass Cards
**Current**: Centered emoji + plain text. Every empty state looks identical and forgettable.

**Redesign**: Glassmorphic card with gradient accent strip, animated floating icon (not emoji — use Lucide icons with gradient backgrounds), and a CTA button. Each empty state gets a unique gradient based on context (notifications = violet, posts = cyan, saved = amber).

**Files**: 
- `src/pages/Notifications.tsx` (EmptyState component)
- `src/components/home/HomeWidgetRenderer.tsx` (InlinePostList empty)
- `src/pages/Profile.tsx` (EmptyState component)

---

### 5. Notification Page Header — Gradient Identity Banner
**Current**: "Notifications" h1 + "X new" text + basic Referrals pill. Standard layout.

**Redesign**: Add a gradient accent line under the header (like the composer redesign). The unread count becomes an animated gradient badge that pulses. The Referrals button gets a gift gradient background with shimmer.

**File**: `src/pages/Notifications.tsx`

---

### 6. Settings Page Header — Premium Glass Identity
**Current**: Basic icon in a rounded box + "Settings" text. The desktop nav is wrapped in a plain `liquid-glass-card`.

**Redesign**: Settings icon gets a rotating gradient ring. Header text uses gradient fill. Desktop category selector buttons get frosted glass active states with glow. Sign out button gets a red glass treatment instead of plain outline.

**File**: `src/pages/Settings.tsx`

---

### 7. Profile Empty States + Post Grid
**Current**: Profile empty states are plain emoji + text. The post grid is a basic 3-col grid with no personality.

**Redesign**: Empty states become illustrated glass cards with animated icons. Post grid gets subtle rounded corners with a staggered fade-in animation on each tile.

**File**: `src/pages/Profile.tsx`

---

### Technical Details

**Files modified** (7 files):
- `src/pages/NotFound.tsx` — Complete cinematic redesign
- `src/pages/Home.tsx` — Customize button redesign
- `src/components/home/HomeWidgetRenderer.tsx` — Feed tabs + empty states
- `src/pages/Notifications.tsx` — Header + empty states
- `src/pages/Settings.tsx` — Header + nav + sign out
- `src/pages/Profile.tsx` — Empty states + grid animation
- `src/index.css` — Add glitch keyframe + new utility animations

**No database changes needed.**

**What stays the same:**
- All functionality, data fetching, and navigation
- Notification grouping and row layout
- Bottom nav design (already polished)
- PostCard layout (recently redesigned)
- All existing motion/spring physics

