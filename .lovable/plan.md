

## Fix Critical Bugs: Posts, Reactions, Tutorial, Notes, Admin Panel, and More

### Root Cause Analysis

**1. Can't post / Can't like (FK violation on `user_levels`)**
The core issue: `add_user_xp()` function inserts `p_user_id` directly into `user_levels.user_id`, which has a foreign key to `auth.users(id)`. But triggers pass **profile IDs** (not auth IDs):
- `grant_xp_on_post_created` passes `NEW.author_id` (profile ID from `posts`)
- `auto_grant_engagement_xp` passes `NEW.user_id` (profile ID from `likes`, `comments`, `bookmarks`)

This causes every post creation and every like/bookmark to fail with FK violation.

**2. Emoji reactions don't persist on refresh**
The `PostCard`/`ShortCard` components correctly upsert reactions with `reaction_type`, and `usePosts` fetches `reaction_type` from `likes`. But the likes insert itself fails (see #1 above), so the reaction is never actually saved. Fixing #1 fixes this.

**3. PostDetail page has basic Heart-only likes (no emoji reactions)**
`PostDetail.tsx` uses a simple `handleLike` that doesn't pass `reaction_type` and doesn't support the emoji reaction picker that `PostCard` and `ShortCard` have.

**4. Tutorial glitch (step 1 appears/disappears, can't click)**
The tutorial overlay appears but the spotlight element detection races — the overlay renders, finds no element initially (DOM not settled), briefly shows then repositions. The `isNavigating` state flickers. Fix: add a minimum delay before showing the overlay and ensure the first step element is always findable on `/home`.

**5. Note GIF bubble bleeding through**
The GIF bubble at `z-[50]` can show through other UI elements. The `overflow-visible` on the scroll container allows the bubble to visually bleed over adjacent content. Need to constrain z-index and clip within the notes section boundary.

**6. Admin DevTools panel transparent/ugly**
`ProductionDebugPanel.tsx` uses `bg-background` which may be transparent on some themes. Fix: use explicit opaque background `bg-card` or add a backdrop.

**7. AI Designer button blocking post button**
The floating AI sparkles button overlaps with the post composer's bottom area. Fix: hide the FAB when the upload/composer page is active.

### Plan

#### Database Migration (critical — fixes posts + likes + reactions)
Fix `add_user_xp` to translate profile_id → auth_id before inserting into `user_levels`:

```sql
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer)
RETURNS jsonb ...
AS $$
DECLARE
  v_auth_id uuid;
  v_result jsonb;
BEGIN
  -- Translate: if p_user_id is a profile ID, look up the auth user_id
  SELECT user_id INTO v_auth_id FROM public.profiles WHERE id = p_user_id;
  IF v_auth_id IS NULL THEN
    -- Maybe it's already an auth ID
    v_auth_id := p_user_id;
  END IF;

  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (v_auth_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp, updated_at = now();

  SELECT jsonb_build_object('success', true, 'xp_added', p_xp) INTO v_result;
  RETURN v_result;
END;
$$;
```

#### File: `src/pages/PostDetail.tsx`
- Add emoji reaction support to match `PostCard` — import `ReactionPicker`, add long-press/hold on heart to show picker, upsert with `reaction_type`, display the correct emoji instead of just Heart

#### File: `src/components/tutorial/TutorialProvider.tsx`
- Increase the initial trigger delay from 800ms to 1500ms so the DOM is fully settled
- Add a guard: only open if the target element for step 0 actually exists in the DOM

#### File: `src/components/tutorial/TutorialOverlay.tsx`
- On step mount, wait for the target element with a polling retry (up to 2s) before showing the tooltip, so it doesn't flash in/out

#### File: `src/components/chat/NotesRow.tsx`
- Fix GIF bubble z-index bleeding: wrap the entire notes section in `relative z-10` and ensure bubbles use `z-20` (relative to parent), not `z-[50]` (global)
- Prevent bubble from overlapping content above: add `pt-10` padding to the container to give bubbles vertical room

#### File: `src/components/debug/ProductionDebugPanel.tsx`
- Change `bg-background` to `bg-card` and add explicit opacity `bg-opacity-100` or use a solid fallback like `backdrop-blur-xl bg-black/95`

#### File: `src/pages/Upload.tsx` or relevant layout
- Hide the floating AI assistant button when the upload/create flow is active (check for existing FAB component and add conditional rendering)

### Files to modify
- `src/pages/PostDetail.tsx` — add emoji reactions
- `src/components/tutorial/TutorialProvider.tsx` — fix flash timing
- `src/components/tutorial/TutorialOverlay.tsx` — wait for DOM element
- `src/components/chat/NotesRow.tsx` — fix GIF bubble bleed
- `src/components/debug/ProductionDebugPanel.tsx` — opaque background

### Database migration
- Fix `add_user_xp` to translate profile_id → auth_id (fixes posts, likes, reactions)

