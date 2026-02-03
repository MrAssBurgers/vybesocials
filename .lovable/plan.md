
# Fix Badge System: Display Name Styling + Retroactive Unlocking

## Problem Summary

The badge system is broken due to a schema mismatch between the original `user_badges` table structure and the new badge-granting functions:

1. **Schema Mismatch**: `user_badges` requires `badge_type` (NOT NULL) and `badge_name` (NOT NULL), but functions only insert `badge_id`
2. **Wrong Unique Constraint**: The unique constraint is on `(user_id, badge_type)`, not `(user_id, badge_id)`
3. **Silent Failures**: Badge inserts fail silently, leaving users without badges
4. **No Display Styling**: Since no badges exist for users, `get_user_primary_badge` returns nothing

---

## Solution

### Step 1: Fix Database Schema

Add a migration that:
1. Makes `badge_type` and `badge_name` columns nullable (or generate them from the linked badge)
2. Changes the unique constraint from `(user_id, badge_type)` to `(user_id, badge_id)`
3. Fixes existing data by backfilling `badge_type` and `badge_name` from the `badges` table

```sql
-- Make badge_type and badge_name nullable OR derive them from badge_id
ALTER TABLE user_badges 
  ALTER COLUMN badge_type DROP NOT NULL,
  ALTER COLUMN badge_name DROP NOT NULL;

-- Drop old unique constraint on (user_id, badge_type)
ALTER TABLE user_badges 
  DROP CONSTRAINT IF EXISTS user_badges_user_id_badge_type_key;

-- Add proper unique constraint on (user_id, badge_id)
ALTER TABLE user_badges 
  ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);
```

### Step 2: Fix Grant Functions

Update `grant_owner_all_badges` and `sync_user_challenge_progress` to properly populate all required fields:

```sql
CREATE OR REPLACE FUNCTION public.grant_owner_all_badges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_badge RECORD;
BEGIN
  SELECT id INTO v_owner_id 
  FROM profiles 
  WHERE LOWER(TRIM(username)) = 'mrassburgers' 
  LIMIT 1;
  
  IF v_owner_id IS NULL THEN RETURN; END IF;
  
  FOR v_badge IN SELECT id, name, category FROM badges WHERE is_active = true
  LOOP
    INSERT INTO user_badges (
      user_id, badge_id, badge_type, badge_name, 
      earned_at, show_effect, is_primary
    )
    VALUES (
      v_owner_id, v_badge.id, v_badge.category::text, v_badge.name,
      NOW(), true, false
    )
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END LOOP;
END;
$$;
```

### Step 3: Fix the User Badge Insert in Challenge Sync

Update `sync_user_challenge_progress` to populate all required columns when awarding badges:

```sql
-- When awarding a badge, include badge_type and badge_name
IF v_challenge.reward_badge_id IS NOT NULL THEN
  INSERT INTO user_badges (
    user_id, badge_id, badge_type, badge_name, 
    earned_at, show_effect
  )
  SELECT 
    p_user_id, 
    b.id, 
    b.category::text, 
    b.name, 
    NOW(), 
    true
  FROM badges b 
  WHERE b.id = v_challenge.reward_badge_id
  ON CONFLICT (user_id, badge_id) DO NOTHING;
END IF;
```

### Step 4: Backfill Existing Records

Populate `badge_id`, `badge_type`, and `badge_name` for any existing records that may be missing them:

```sql
-- Backfill any records that have badge_id but missing badge_type/name
UPDATE user_badges ub
SET 
  badge_type = COALESCE(ub.badge_type, b.category::text),
  badge_name = COALESCE(ub.badge_name, b.name)
FROM badges b
WHERE ub.badge_id = b.id
  AND (ub.badge_type IS NULL OR ub.badge_name IS NULL);
```

### Step 5: Force Re-sync on Login

Update `useRetroactiveSync.ts` to:
1. Reset the sync flag when profile changes
2. Call sync functions with retry logic
3. Add better error handling and logging

```typescript
export function useRetroactiveSync() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    // Reset if user changed
    if (profile?.id !== lastSyncedUserId.current) {
      lastSyncedUserId.current = null;
    }
    
    if (!profile?.id || lastSyncedUserId.current === profile.id) return;

    const syncProgress = async () => {
      try {
        // Sync challenge progress 
        const { error: syncError } = await supabase.rpc('sync_my_challenge_progress');
        if (syncError) console.error('[RetroactiveSync] sync error:', syncError);
        
        // If owner, grant all badges
        if (isOwner(profile.username)) {
          const { error: ownerError } = await supabase.rpc('grant_owner_all_badges');
          if (ownerError) console.error('[RetroactiveSync] owner badge error:', ownerError);
        }
        
        // Invalidate all badge/display queries
        await queryClient.invalidateQueries({ queryKey: ['user-badges'] });
        await queryClient.invalidateQueries({ queryKey: ['display-style'] });
        
        lastSyncedUserId.current = profile.id;
        console.log('[RetroactiveSync] Completed for:', profile.username);
      } catch (error) {
        console.error('[RetroactiveSync] Failed:', error);
      }
    };

    syncProgress();
  }, [profile?.id, profile?.username, queryClient]);
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/new_migration.sql` | Create migration to fix schema and grant functions |
| `src/hooks/useRetroactiveSync.ts` | Improve error handling and logging |

---

## Expected Outcome

After implementation:
- Owner (MrAssBurgers) will have all badges automatically granted
- Display names will show gradient colors based on highest-priority badge
- Users who completed challenges will retroactively receive their badges
- Badge styling will persist across the entire app
