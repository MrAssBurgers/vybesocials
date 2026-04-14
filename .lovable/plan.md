

## VYBE Profile — Complete Redesign (noplace-Inspired Identity)

### The Problem
The current profile is a standard Instagram clone: big circular avatar → username → stats row (posts/followers/following) → bio → tab grid. Every social app looks like this. It's forgettable.

### The Vision
Inspired by noplace's colorful, customizable, personality-first approach — but taken further with VYBE's glass aesthetic and motion design. The profile becomes a **living card** that expresses who you are, not just what you've posted.

---

### Key Design Changes

**1. Hero Identity Card (replaces avatar + stats header)**
- Full-width rounded card at the top with the user's chosen background color/gradient (from their locker theme or a new color picker)
- Avatar floats on the left edge of the card, overlapping the border (like a sticker on a notebook)
- Display name is large and bold inside the card, username smaller below it
- Current vibe/status shows as a live pill badge right under the name ("🎧 listening to music")
- Stats (posts, followers, following) become **horizontal capsules** inside the card, not a separate row — compact, colorful, tappable
- Badges display inline next to the name, not in a separate section
- The entire card has a subtle parallax tilt on scroll (gyroscope on mobile)

**2. "About Me" Blocks (replaces plain bio)**
- Bio becomes a styled text block with the user's chosen background color
- Below it: a row of customizable "star signs" — favorite emoji, top interest tags, relationship status, location — displayed as colorful rounded pills (like noplace's profile fields)
- These are **user-editable fields** stored in the profile, not computed

**3. Vibe Board (replaces Bento Grid)**
- Instead of a rigid bento grid, the profile has a **vertical stack of expressive cards**:
  - **"Currently..."** card: what they're listening to, watching, playing, reading (4 slots with icons)
  - **Top Friends** card: circular avatars of their top 3-5 friends with online indicators
  - **VYBE DNA** card: the existing DNA visualization but styled as a premium card with glow
- Each card has a distinct background color that the user picks (noplace's most distinctive feature)
- Cards animate in with stagger on profile load

**4. Content Tabs Redesign**
- Replace the Instagram-style icon tabs with **pill-shaped segment control** at the bottom of the identity section
- Posts grid gets **rounded corners on each cell** (8px radius) instead of the 1px gap Instagram grid
- Add a "Highlights" tab (pinned posts) between Posts and Clips

**5. Action Buttons Redesign**
- For own profile: "Edit Profile" becomes a floating edit icon on the hero card corner
- For other profiles: Follow/Message/Friend become a **stacked vertical pill group** on the right side of the hero card, not a horizontal row below
- Share button integrated into the card as a small icon

**6. Color Customization System**
- Users can pick a **primary** and **secondary** profile color from a preset palette (12 vibrant colors + pastels)
- These colors tint their hero card background, about-me block, and vibe board card backgrounds
- Stored in the profile/locker system
- Visitors see the profile in the owner's chosen colors — this is what makes every profile feel unique

---

### Technical Details

**Files modified:**
- `src/pages/Profile.tsx` — Full rewrite of the layout structure. Hero card, vibe board, new tabs, color system
- `src/components/profile/ProfileBentoGrid.tsx` — Replaced with new `ProfileVibeBoard.tsx`
- `src/components/profile/EngagementScore.tsx` — Integrated into hero card as inline element

**New files:**
- `src/components/profile/ProfileHeroCard.tsx` — The identity card component with parallax, avatar, stats capsules, action buttons
- `src/components/profile/ProfileVibeBoard.tsx` — Vertical stack of colorful "currently" / "top friends" / "DNA" cards
- `src/components/profile/ProfileAboutMe.tsx` — Bio + interest pills + personal fields
- `src/components/profile/ProfileColorPicker.tsx` — Color selection UI for edit mode

**What stays the same:**
- All data fetching hooks (useProfileByUsername, usePosts, useFollow, etc.)
- Locker system, badges, cosmetics (frames, effects, name colors)
- Moderator tools and dialogs
- Post grid content and clips grid
- Profile themes from the locker still work (override the color system)

