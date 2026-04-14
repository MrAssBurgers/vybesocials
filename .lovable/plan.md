

## Profile Mobile Fix + Visual Redesign Pass

### Problem 1: Profile Content Cutoff on Mobile
The profile page uses `max-w-lg` (512px) with `px-4` padding, plus `pb-28` for bottom nav clearance. On narrow phones (320-375px), the stat capsules row and action buttons in `ProfileHeroCard` can overflow. The avatar + identity + action buttons layout uses `flex items-start gap-4` with fixed `h-20 w-20` avatar, which leaves very little space for long usernames and badges on small screens.

### Problem 2: Making VYBE Look Uniquely Premium
The biggest visual opportunity is the **PostCard** — the most-seen component. Right now it's a standard card layout (avatar + name header, media, action row). Every social app looks like this. Here's what I'd redesign:

---

### Changes

#### 1. Profile Mobile Overflow Fixes (`ProfileHeroCard.tsx`)
- Reduce avatar from `h-20 w-20` to `h-16 w-16` on screens < 375px using responsive classes
- Make stat capsules row horizontally scrollable with `overflow-x-auto no-scrollbar` instead of wrapping/clipping
- Add `min-w-0` and `truncate` to username text to prevent text overflow
- Reduce action button column gap on small screens

#### 2. Profile Page (`Profile.tsx`)
- Change `px-4` to `px-3 sm:px-4` for tight screens
- Ensure `pb-28` accounts for safe-area-inset-bottom: `pb-[calc(7rem+env(safe-area-inset-bottom))]`

#### 3. PostCard "Aura Gradient" Redesign (`PostCard.tsx`)
This is the signature visual change — a **living color accent strip** on each post card that makes VYBE feel unlike any other platform:
- Add a thin (3px) animated gradient accent line at the top of each post card, derived from the author's VYBE DNA signature colors (or a default primary gradient)
- The accent subtly pulses/shifts, giving each post a "living" feel
- Replace the flat `liquid-glass-card` border with a softer `border-border/10` so the accent line becomes the visual anchor
- Add a subtle frosted noise texture overlay to the card background (CSS-only, no images)

#### 4. PostCard Action Bar Redesign (`PostCard.tsx`)
- Move the action buttons from a horizontal row to a **vertical floating pill** on the right side of the media (like TikTok/Threads hybrid), but only for posts with media
- For text-only posts, keep horizontal layout
- Each action button gets a subtle count beneath it in a compact vertical stack
- The bookmark moves into this vertical bar instead of being isolated on the right

#### 5. Feed Tab Bar Polish (`HomeWidgetRenderer.tsx`)
- Add a subtle animated underline indicator that slides between tabs instead of the background swap
- Give the active tab a slight glow effect matching the primary color

---

### Technical Details

**Files modified:**
- `src/components/profile/ProfileHeroCard.tsx` — Responsive avatar sizing, scrollable stats, truncated text
- `src/pages/Profile.tsx` — Safe-area padding, tighter mobile spacing
- `src/components/posts/PostCard.tsx` — Aura accent gradient strip at top, vertical action bar for media posts
- `src/components/home/HomeWidgetRenderer.tsx` — Animated tab underline indicator

**No database changes needed.**

**What stays the same:**
- All existing functionality (reactions, bookmarks, comments, shares)
- PostCard header layout (avatar + username + menu)
- Profile VibeBoard and AboutMe sections
- All existing animations and haptic feedback

