

# Fix Challenge Tracking System & Add Navigation

## Problems Identified

### 1. Triggers Not Created for All Actions
The migration that added triggers is missing:
- **No `complete_profile` trigger** on profiles table - profile updates don't track the challenge
- **No `referral` trigger** - referral confirmations aren't being tracked
- Existing triggers work (comment trigger incremented from 0 to 1) but weren't retroactive

### 2. Sync Function Not Updating Existing Progress
- `sync_my_challenge_progress()` exists but doesn't run on every profile update
- User has 3 comments but only 1 is counted (sync ran before other 2 comments were made)
- `complete_profile` check requires BOTH `avatar_url` AND `display_name` - too strict

### 3. No Navigation from Challenges
- Clicking a challenge doesn't take users to where they can complete it

---

## Solution

### Database Changes

#### 1. Add Profile Update Trigger
Create a trigger on `profiles` table that checks profile completion when profile is updated:

```sql
CREATE OR REPLACE FUNCTION on_profile_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if profile is now "complete" (has avatar_url OR display_name OR bio)
  IF (NEW.avatar_url IS NOT NULL OR NEW.display_name IS NOT NULL OR NEW.bio IS NOT NULL AND LENGTH(NEW.bio) > 0)
     AND (OLD.avatar_url IS NULL AND OLD.display_name IS NULL AND (OLD.bio IS NULL OR LENGTH(OLD.bio) = 0)) THEN
    PERFORM increment_challenge_progress(NEW.id, 'complete_profile');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_profile_challenge
AFTER UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION on_profile_updated();
```

#### 2. Add Referral Trigger
```sql
CREATE OR REPLACE FUNCTION on_referral_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.confirmed = true AND (OLD IS NULL OR OLD.confirmed = false) THEN
    PERFORM increment_challenge_progress(NEW.referrer_id, 'invite');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_referral_challenge
AFTER INSERT OR UPDATE ON referrals
FOR EACH ROW
EXECUTE FUNCTION on_referral_confirmed();
```

#### 3. Fix sync_my_challenge_progress Profile Check
Make the `complete_profile` requirement more lenient (any of: avatar, display_name, or bio):

```sql
WHEN 'complete_profile' THEN
  SELECT CASE 
    WHEN avatar_url IS NOT NULL 
      OR display_name IS NOT NULL 
      OR (bio IS NOT NULL AND LENGTH(bio) > 0) 
    THEN 1 
    ELSE 0 
  END INTO v_current_count
  FROM profiles WHERE id = v_profile_id;
```

#### 4. Create Manual Sync RPC
Add an RPC that can be called to force-sync all challenges:

```sql
CREATE OR REPLACE FUNCTION force_sync_my_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM sync_my_challenge_progress();
END;
$$;
```

---

### Frontend Changes

#### 1. Add Challenge Route Mapping
In `src/hooks/useChallenges.ts`, add a mapping from requirement_type to route:

```typescript
export const CHALLENGE_ROUTES: Record<string, string> = {
  'post': '/upload',
  'comment': '/explore',
  'like': '/explore', 
  'follow': '/explore',
  'follower': '/u/me', // Their own profile
  'message': '/messages',
  'new_conversation': '/messages/new',
  'complete_profile': '/settings',
  'invite': '/invite',
  'login': '/', // No navigation needed
};
```

#### 2. Update ChallengesHub.tsx
Make challenge cards clickable with navigation:

```typescript
import { useNavigate } from 'react-router-dom';
import { CHALLENGE_ROUTES } from '@/hooks/useChallenges';

// In component:
const navigate = useNavigate();

const handleChallengeClick = (challenge: Challenge) => {
  if (challenge.is_completed) return; // Don't navigate if completed
  
  const route = CHALLENGE_ROUTES[challenge.requirement_type];
  if (route) {
    toast.info(`Complete this challenge: ${challenge.title}`);
    navigate(route);
  }
};

// Update GlassCard to be clickable:
<GlassCard 
  className={cn(
    "p-4 relative overflow-hidden cursor-pointer hover:border-primary/40 transition-colors",
    challenge.is_completed && "border-primary/30 bg-primary/5"
  )}
  onClick={() => handleChallengeClick(challenge)}
>
```

#### 3. Add Manual Sync Button
Add a "Sync Progress" button in ChallengesHub that calls the RPC:

```typescript
const handleSyncProgress = async () => {
  try {
    const { error } = await supabase.rpc('force_sync_my_challenges');
    if (error) throw error;
    
    // Invalidate queries to refresh
    queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
    toast.success('Challenges synced!');
  } catch (error) {
    toast.error('Failed to sync challenges');
  }
};
```

#### 4. Trigger Sync on Profile Save
In `ProfileSection.tsx`, after saving profile, call sync:

```typescript
const handleSave = async () => {
  // ... existing save logic
  
  // Sync challenges after profile update
  await supabase.rpc('force_sync_my_challenges');
  queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| New migration | Add profile trigger, referral trigger, fix sync function, add force_sync RPC |
| `src/hooks/useChallenges.ts` | Add CHALLENGE_ROUTES mapping |
| `src/pages/ChallengesHub.tsx` | Add click navigation, sync button |
| `src/components/settings/ProfileSection.tsx` | Trigger sync after save |

---

## Expected Behavior After Fix

1. **Profile completion**: Update your profile → "First Steps" challenge completes
2. **Leaving comments**: Comments trigger updates the progress bar in real-time
3. **Click on challenge**: Tapping "Engaged" (comment challenge) → navigates to Explore page
4. **Sync button**: Tapping "Sync" recalculates all progress from actual data
5. **All previous actions counted**: Your 3 comments will show 3/10 progress after sync

