
# Pinned posts → profile only, plus tasteful feed upgrades

## The bug you described
Right now `usePosts` sorts every feed query by `is_pinned DESC`, so when *anyone* pins a post it bubbles to the top of the **public Home / Explore feed** for every viewer — not just on their own profile. The menu label already says "Pin to Profile", so the data layer just doesn't match the intent.

## What I'll change

### 1. Pin truly = profile-only
- Remove `is_pinned` from the Home / Explore / Following / Local feed sort orders so pinned posts no longer get global priority.
- Pinned posts still show the "Pinned" badge on the post card, but that badge only matters when viewing on the author's profile.
- On the **author's profile grid**, pinned posts:
  - Sort to the top of the Posts and Shorts tabs.
  - Get a small pin chip overlay in the corner of the thumbnail.
- Cap pins at **3 per user**. If a 4th is pinned, oldest pin auto-unpins (with a toast). Matches Instagram / TikTok / X behavior.
- Optimistic toggle so the pin/unpin action feels instant; React Query cache patches before the server round-trips.

### 2. "Make it 100x better" — focused, low-risk wins

I'm intentionally NOT rewriting the recommendation engine or DNA scoring (those already exist and are tuned). Instead, three high-leverage polish items that consistently matter:

a. **Don't show me my own posts in Home/Explore feeds.**
   Right now you can scroll past your own content. Filter `author_id != currentUser` in `usePosts` and `useFollowingPosts`. Profile/Search/post detail still show your posts.

b. **Hide blocked / muted users from feeds.**
   Quick check: there's a blocks table referenced elsewhere. I'll wire `useInfinitePosts` and `usePosts` to exclude posts from anyone the viewer has blocked or muted, instead of relying on per-card filtering after the fact.

c. **Smarter "Following" tab fallback.**
   When you follow nobody (or no one you follow has posted in 7 days), `useFollowingPosts` returns empty and the tab looks broken. I'll fall back to friend-of-friend + your top-engagement-DNA posts so the tab is never empty.

### 3. Pin-on-profile UX details
- "Pin to Profile" menu item only appears on **your own** posts (already true) and is disabled when you've hit the 3-pin cap with a tooltip "You can pin up to 3 posts."
- Unpinning is instant and doesn't reorder the feed (since the feed no longer sorts by pin).
- Pin badge on the profile grid: tiny pin glyph top-left, semi-transparent, matches the existing badge styling — no new colors / tokens.

## Technical details

**Files I'll edit:**
- `src/hooks/usePosts.ts` — drop `.order('is_pinned', ...)` from `usePosts` and `useFollowingPosts`; add `.neq('author_id', profile.id)` for non-profile feed views; sort `is_pinned DESC` only when `authorId` is provided (profile view); enforce 3-pin cap inside `useTogglePin`; optimistic update.
- `src/hooks/useInfinitePosts.ts` — same author-exclusion + blocked-user filter.
- `src/hooks/useFeedAlgorithm.ts` / `useLocalFeed.ts` — author-exclusion only (these don't sort by pin).
- `src/pages/Profile.tsx` — sort `gridPosts` and `clipsForGrid` by `is_pinned` first, render pin chip overlay on pinned thumbnails.
- `src/components/posts/PostCard.tsx` — disable Pin menu item when at cap (read 3-pin status from a small new hook `usePinnedPostCount(profileId)`).

**Database:** No schema changes — `posts.is_pinned` already exists. No migration needed. No RLS changes needed (users can already update their own posts).

**Backwards compatibility:** Existing pinned posts stay pinned; they just stop affecting non-profile feeds. If a user already has >3 pinned posts, the cap only kicks in on the *next* pin attempt — nothing gets auto-unpinned silently.

## What I'm NOT doing in this round
- No changes to the Clips/Shorts vertical feed ordering algorithm.
- No DNA / ranking model changes.
- No new tables, no schema migrations, no edge functions.
- No visual redesign of post cards beyond the small pin chip on profile thumbnails.

If you want me to also tackle Clips ranking, Explore section weights, or a richer "pinned" treatment (e.g. a dedicated "Pinned" row above the profile grid), say the word and I'll do it as a follow-up.
