
# Comprehensive Bug Fix and App Walkthrough Plan

## Summary of Issues Found

After a deep analysis of the codebase, database, and logs, I've identified several critical issues that need to be fixed:

### Critical Issues

#### 1. Old Posts Not Loading
**Root Cause**: The `get_posts_with_counts` RPC function is working correctly, but the frontend has aggressive caching settings that prevent fresh data from loading. Additionally, the infinite scroll pagination is using `refetchOnMount: false` which means old posts may not appear when navigating to the home page.

**Evidence**:
- Database has 55 posts total (51 posts, 4 shorts) dating from Jan 8 to Jan 28
- RPC functions exist and work correctly with proper pagination
- `useInfinitePosts.ts` uses `staleTime: 5 * 60 * 1000` (5 minutes) and `refetchOnMount: false`

#### 2. AI Features Not Working
**Root Cause**: Multiple AI edge functions (`get-recommendations`, `ai-catch-up`) show no logs, suggesting they may not be called correctly or have silent failures. The `ai-catch-up` function also has a query issue - it queries `profiles` table with `user_id` instead of using the correct profile ID lookup.

**Evidence**:
- Line 124-126 in `ai-catch-up/index.ts`: `.eq('id', user.id)` should be `.eq('user_id', user.id)` since `user.id` is the auth user ID, not the profile ID
- No edge function logs for `get-recommendations`

#### 3. RLS Policy Errors (Critical Database Issues)
**Root Cause**: Database logs show recurring errors:
- `infinite recursion detected in policy for relation "group_members"`
- `infinite recursion detected in policy for relation "group_call_participants"`
- `new row violates row-level security policy for table "chat_presence"`

**Evidence**: Database analytics query shows these errors occurring repeatedly

#### 4. Chat Presence RLS Issues
**Root Cause**: The INSERT policy for `chat_presence` requires the user to be a conversation member, but the check happens before the user's membership can be verified, causing RLS failures.

---

## Implementation Plan

### Phase 1: Fix Old Posts Loading

**File: `src/hooks/useInfinitePosts.ts`**

Changes needed:
1. Enable `refetchOnMount: 'always'` to ensure fresh data loads when returning to home
2. Reduce `staleTime` to 2 minutes for more frequent updates
3. Add a mechanism to detect and load genuinely old posts (beyond initial pagination)
4. Ensure the initial page size doesn't artificially cap viewable content

```
// Before
staleTime: STALE_TIME,
gcTime: GC_TIME,
refetchOnMount: false,
refetchOnWindowFocus: false,

// After  
staleTime: 2 * 60 * 1000, // 2 minutes
gcTime: GC_TIME,
refetchOnMount: 'always', // Always fetch fresh on mount
refetchOnWindowFocus: false,
```

**File: `src/pages/Home.tsx`**

Add a "Load More" fallback for when infinite scroll doesn't trigger properly, and ensure proper error handling for failed fetches.

### Phase 2: Fix AI Edge Functions

**File: `supabase/functions/ai-catch-up/index.ts`**

Fix the profile query - currently uses wrong ID:
```
// Line 121-126 - Current (broken):
const { data: userProfile } = await supabase
  .from('profiles')
  .select('interests, display_name, username')
  .eq('id', user.id)  // user.id is auth user ID, not profile ID!
  .single();

// Fixed:
const { data: userProfile } = await supabase
  .from('profiles')
  .select('interests, display_name, username')
  .eq('user_id', user.id)  // Correct: query by user_id column
  .single();
```

Also fix lines 146-149 for follows query and lines 158-166 for posts query which have similar issues.

**File: `src/components/ai/AIRecommendations.tsx`**

Add better error handling and fallback when AI recommendations fail:
- Show cached/trending posts as fallback
- Add retry mechanism with exponential backoff
- Add user-facing error state instead of silent failure

### Phase 3: Fix RLS Infinite Recursion

**Database Migration Required**

The `group_members` and `group_call_participants` tables have RLS policies that reference themselves, causing infinite recursion. Need to fix these policies:

For `group_members`, the policy "Members can view their group's members" has recursive self-reference. Fix by using a security definer function:

```sql
-- Create helper function to avoid recursion
CREATE OR REPLACE FUNCTION is_group_member(conv_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM group_members gm
    JOIN profiles p ON p.id = gm.user_id
    WHERE gm.conversation_id = conv_id
    AND p.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update policy to use function instead of self-referencing query
DROP POLICY IF EXISTS "Members can view their group's members" ON group_members;
CREATE POLICY "Members can view their group's members" ON group_members
  FOR SELECT USING (
    user_id = current_profile_id() OR
    is_group_member(conversation_id)
  );
```

Similar fix needed for `group_call_participants`.

### Phase 4: Fix Chat Presence RLS

**Database Migration Required**

Update the INSERT policy for `chat_presence` to properly allow users to insert their own presence:

```sql
-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Users can insert their own presence" ON chat_presence;

-- Create new policy that checks membership correctly
CREATE POLICY "Users can insert their own presence" ON chat_presence
  FOR INSERT
  WITH CHECK (
    user_id = current_profile_id() AND
    conversation_id IN (
      SELECT conversation_id FROM conversation_members
      WHERE user_id = current_profile_id()
    )
  );
```

### Phase 5: Additional Bug Fixes Found During Walkthrough

#### 5.1 Duplicate Key Error for Message Views
**Issue**: `duplicate key value violates unique constraint "message_views_message_id_user_id_key"`

**Fix**: Use UPSERT instead of INSERT in message view tracking:
```typescript
// In useMessages.ts - use onConflict to ignore duplicates
await supabase
  .from('message_views')
  .upsert({ message_id, user_id }, { onConflict: 'message_id,user_id' });
```

#### 5.2 Signed URL Cache Improvements
The current signed URL cache can fail silently for old/deleted media. Add explicit handling for 404 responses to show proper fallback UI faster.

#### 5.3 Pull-to-Refresh Cache Clear
When pulling to refresh on home page, ensure the React Query cache is properly invalidated to force new data:

```typescript
const handleRefresh = useCallback(async () => {
  queryClient.invalidateQueries({ queryKey: ['infinite-posts'] });
  await refetchForYou();
}, [queryClient, refetchForYou]);
```

---

## Technical Details

### Files to Modify

1. **`src/hooks/useInfinitePosts.ts`**
   - Fix refetch settings for fresh data loading
   - Improve cache invalidation strategy

2. **`supabase/functions/ai-catch-up/index.ts`**
   - Fix profile ID query (user.id -> user_id column)
   - Fix follows query reference
   - Fix posts query reference

3. **`src/components/ai/AIRecommendations.tsx`**
   - Add better error handling and loading states
   - Implement proper fallback mechanism

4. **`src/hooks/useMessages.ts`**
   - Fix duplicate key error by using upsert for message views

5. **`src/pages/Home.tsx`**
   - Improve pull-to-refresh cache handling
   - Add manual refresh button for edge cases

6. **`src/hooks/useChatPresence.ts`**
   - Add try-catch wrapper to prevent RLS errors from bubbling up

### Database Migrations Needed

1. **Fix group_members RLS recursion**
   - Create security definer helper function
   - Update recursive policy

2. **Fix group_call_participants RLS recursion**
   - Similar pattern to group_members

3. **Fix chat_presence INSERT policy**
   - Allow proper presence insertion with membership check

---

## Expected Results After Implementation

1. **Old Posts**: Will load correctly when scrolling, with proper pagination and no artificial limits
2. **AI Features**: AI Brief and Recommendations will work properly with correct database queries
3. **Chat Presence**: No more RLS errors when users join/view conversations
4. **Group Features**: Group calls and member management will work without recursion errors
5. **Message Views**: No duplicate key errors, proper read tracking
6. **Overall Performance**: Better cache management with faster data loading

---

## Testing Checklist

After implementation, verify:
- [ ] Posts from January load when scrolling down
- [ ] AI Daily Brief shows personalized content
- [ ] AI Recommendations section populates
- [ ] Chat presence indicators work without console errors
- [ ] Group chats function properly
- [ ] Pull-to-refresh fetches new content
- [ ] No duplicate key errors in message views
