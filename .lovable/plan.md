

## Plan: Fix Reaction Persistence & Smooth All Animations

### Issue 1: Reactions other than thumbs up don't persist on reload

**Root cause**: The `get_posts_with_counts` database RPC returns `is_liked` (boolean) but never returns the `reaction_type` column. So when posts reload, the component initializes with `post.is_liked ? 'like' : null` — always defaulting to thumbs up even if the user reacted with love/haha/wow/etc.

Additionally, `usePosts.ts` fetches likes as `select('post_id')` without including `reaction_type`, so even the non-RPC paths lose the reaction type.

**Fix**:
1. **Update the `get_posts_with_counts` RPC** (database migration) to also return the user's `reaction_type` from the `likes` table
2. **Update `get_following_posts_with_counts` RPC** similarly
3. **Update `get_local_posts` RPC** similarly  
4. **Update `useInfinitePosts.ts`** `transformPost` to include `reaction_type` in the Post type
5. **Update `usePosts.ts`** to select `post_id, reaction_type` from likes and pass it through
6. **Update `PostCard.tsx`, `ShortCard.tsx`, `MobileShortCard.tsx`** to initialize `currentReaction` from `post.reaction_type` instead of defaulting to `'like'`

### Issue 2: Animations bounce back and forth instead of smooth one-direction flow

**Root cause**: Multiple CSS keyframe animations use ping-pong patterns (0% → 50% → back to 0%) causing a jarring back-and-forth motion.

**Fix** — Convert these keyframes to smooth unidirectional loops:

1. **`gradient-shift`** (used by `.gradient-animated` buttons and `.create-button-gradient`): Change from bouncing background-position to a smooth continuous sweep `0% 50%` → `100% 50%` → `200% 50%` (seamless loop via extended background-size)
2. **`premium-gold-shimmer`** (username animations): Change from `0% → 100% → 0%` background-position to smooth one-directional `0% → 100%` with `background-size: 300%` ensuring seamless wrap
3. **Duplicate `gradient-shift` keyframes**: Remove the duplicate at line 2797 and unify into one clean definition

### Files to modify

**Database**: 
- Migration to update `get_posts_with_counts`, `get_following_posts_with_counts`, and `get_local_posts` RPCs to return `reaction_type`

**Frontend**:
- `src/hooks/useInfinitePosts.ts` — Add `reaction_type` to Post interface and `transformPost`
- `src/hooks/usePosts.ts` — Fetch `reaction_type` alongside `post_id` from likes
- `src/components/posts/PostCard.tsx` — Use `post.reaction_type` for initial state
- `src/components/posts/ShortCard.tsx` — Same
- `src/components/posts/MobileShortCard.tsx` — Same
- `src/index.css` — Rewrite `gradient-shift` and `premium-gold-shimmer` keyframes to smooth unidirectional motion; remove duplicate keyframe block
- `src/components/ui/StyledUsername.tsx` — Add `forwardRef` wrapper (from previous plan)

