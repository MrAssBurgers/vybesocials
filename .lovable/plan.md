

## Full Visual Refresh — Round 2

After scanning the entire app, these pages stand out as bland, template-like, or visually flat compared to the recently redesigned pages.

---

### 1. Leaderboard Page — Podium Hero + Neon Rank Cards
**Current**: Plain Trophy icon + centered text header. Standard TabsList. Rows are basic `hover:bg-accent/50` links in a `liquid-glass-card`.

**Redesign**:
- Top 3 users get a **podium layout** — three stacked cards with the #1 in the center raised higher, gold/silver/bronze gradient borders and ambient glow
- Each podium card shows avatar with a pulsing rank ring
- Remaining rows get subtle gradient left-border accent based on rank tier
- Header becomes a gradient text "Leaderboard" with animated trophy that rotates on mount
- Tabs get the frosted capsule treatment (matching Home feed tabs)

**File**: `src/pages/Leaderboard.tsx`

---

### 2. Search Page — Immersive Discovery Hub
**Current**: Plain search input + basic pill tabs + flat `PersonRow` items. "Suggested for you" section is a plain list with no visual distinction.

**Redesign**:
- Search input gets a gradient border glow on focus with floating search icon animation
- Tab pills get inner glow on active state (matching existing capsule pattern)
- Trending/Suggested section gets horizontal scrollable avatar cards with gradient rings instead of a flat list
- PersonRow gets a glassmorphic hover card with subtle gradient accent strip on the left
- Empty results gets the illustrated glass card treatment
- "Find Friends from Contacts" button gets gradient shimmer treatment

**File**: `src/pages/Search.tsx`

---

### 3. Feedback Page — Community Voice Board
**Current**: Plain h1 "Feedback" + standard cards with basic borders. Filter is a bare Select dropdown. No visual hierarchy.

**Redesign**:
- Header gets a gradient icon container + gradient text, matching Settings page treatment
- FeedbackCard gets gradient accent strip on the left based on type (red=bug, blue=feature, green=improvement)
- Vote/like button gets animated fill effect on tap
- Filter pills become capsule buttons instead of a dropdown
- Empty state gets glassmorphic illustrated card
- "Submit" button becomes a floating gradient FAB at bottom-right

**File**: `src/pages/Feedback.tsx`

---

### 4. Sounds Page — Music Discovery Vibe
**Current**: Standard sticky header with plain Input. Tabs are default TabsList. Sound grid skeletons are plain gray boxes. Empty states are bare icons + text.

**Redesign**:
- Header gets animated equalizer bars next to the "Sounds" title (CSS animation)
- Search input gets the gradient focus glow
- Tab triggers get neon underline on active state
- "Live" badge gets a pulsing red dot instead of generic animate-pulse
- Empty states get context-colored glassmorphic cards with animated music icons
- The "Upload" button becomes a gradient pill with shimmer

**File**: `src/pages/Sounds.tsx`

---

### 5. Terms & Privacy Pages — Modern Legal Styling
**Current**: Wall of plain text with basic section headers. No visual rhythm. Looks like a raw HTML document.

**Redesign**:
- Add a frosted glass sidebar-style table of contents (desktop) or collapsible accordion (mobile) for section navigation
- Section headers get numbered gradient badges (e.g., "01" in a primary-colored circle)
- Key terms/definitions get highlighted with a subtle `bg-primary/5` inline marker
- Add a gradient accent line under the page header
- Contact email gets a glassmorphic card treatment instead of bare link

**Files**: `src/pages/Terms.tsx`, `src/pages/Privacy.tsx`

---

### 6. Messages Empty State — Conversation Starter
**Current**: Desktop empty state is just "Select a conversation / or start a new chat" in plain text centered on a blank area.

**Redesign**:
- Animated chat bubble illustration using Lucide icons (MessageCircle stacked)
- Gradient text for the heading
- Subtle floating particle animation in the background of the empty area
- "Start a Chat" CTA button with gradient shimmer

**File**: `src/pages/Messages.tsx`

---

### Technical Details

**Files modified** (8 files):
- `src/pages/Leaderboard.tsx` — Podium hero + rank cards
- `src/pages/Search.tsx` — Discovery hub with gradient search + horizontal suggested
- `src/pages/Feedback.tsx` — Community voice board with type-colored accents
- `src/pages/Sounds.tsx` — Music discovery with equalizer animations
- `src/pages/Terms.tsx` — Modern legal with numbered sections
- `src/pages/Privacy.tsx` — Matching legal redesign
- `src/pages/Messages.tsx` — Desktop empty state upgrade
- `src/index.css` — Equalizer keyframes + new utility animations

**No database changes needed.**

**What stays the same:**
- All data fetching, hooks, and functionality
- All existing navigation and routing
- Component structure and prop interfaces
- Mobile responsiveness and safe areas

