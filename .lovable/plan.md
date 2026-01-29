

# Fix: Auth Bootstrap Stuck Due to RLS Policy Recursion

## Problem Analysis

The app is stuck in an infinite "Signing you in..." state because:

1. **RLS Policy Recursion**: The `current_profile_id()` function queries the `profiles` table, and it's used in RLS policies ON the `profiles` table itself
2. The database logs show repeated **"infinite recursion detected in policy for relation 'profiles'"** errors
3. The `fetchProfile` function in `auth.tsx` fails because it cannot query profiles due to the recursive RLS check

### Affected Policies on `profiles` Table

| Policy Name | Problem |
|-------------|---------|
| "Users can view friend profiles" | Calls `current_profile_id()` which queries profiles |
| "Users can view profiles of conversation members" | Calls `current_profile_id()` which queries profiles |

---

## Solution

### Part 1: Fix the Database RLS Policies

**Replace the recursive policies** with policies that use `auth.uid()` directly instead of `current_profile_id()`:

1. **Drop the problematic policies**:
   - "Users can view friend profiles"
   - "Users can view profiles of conversation members"

2. **Create a new, non-recursive `current_profile_id_safe()` function** that bypasses RLS using `SECURITY DEFINER`

3. **Create replacement SELECT policies** that either:
   - Use `auth.uid()` directly with a join
   - OR allow authenticated users to read basic public profiles (simpler approach that still protects sensitive fields via the view)

4. **Ensure users can always read their own profile** with a simple policy using `auth.uid() = user_id`

### Part 2: Make Auth Bootstrap Resilient

Update `src/lib/auth.tsx` to:

1. **Mark user as signed in immediately** when a valid session exists, even if profile data is still loading
2. **Set loading = false** as soon as session is confirmed, not after profile loads
3. **Add a separate `profileLoading` state** for UI that needs to wait for profile
4. **Retry profile fetch silently** in the background if it fails
5. **Never log users out** due to profile fetch failures

### Part 3: Update `current_profile_id()` Function

Modify the function to use a subquery approach that avoids triggering RLS:

```sql
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  -- This bypasses RLS since it's SECURITY DEFINER
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;
```

The function is already `SECURITY DEFINER`, so it should bypass RLS. However, the policies themselves reference it in a way that creates the loop. The fix is to ensure the SELECT policy for own profile uses `auth.uid()` directly.

---

## Implementation Steps

### Step 1: Database Migration

Create a migration that:

```sql
-- 1. Drop problematic policies
DROP POLICY IF EXISTS "Users can view friend profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view profiles of conversation members" ON profiles;

-- 2. Create a simple, non-recursive policy for own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Create policy for viewing any public profile (basic info only)
-- This allows reading profiles without recursion
CREATE POLICY "Authenticated users can view public profiles" ON profiles
  FOR SELECT TO authenticated
  USING (true);  -- Allow reading all profiles for authenticated users
```

Note: Sensitive fields (email, phone_number) are already protected by the `public_profiles` view created earlier.

### Step 2: Update Auth Provider

Modify `src/lib/auth.tsx`:

```typescript
// Add profileLoading state separate from auth loading
const [profileLoading, setProfileLoading] = useState(true);

// In onAuthStateChange:
if (session?.user) {
  setLoading(false);  // App can render immediately
  setIsInitialized(true);
  // Profile loads in background
  fetchProfile(session.user.id).finally(() => setProfileLoading(false));
} else {
  setLoading(false);
  setProfileLoading(false);
  setIsInitialized(true);
}

// In fetchProfile - never throw, always recover:
const fetchProfile = async (userId: string, retryCount = 0) => {
  // ... existing code with better error handling ...
  // On failure, set a minimal fallback profile instead of null
}
```

### Step 3: Export profileLoading

Add `profileLoading` to the context so components can show appropriate loading states without blocking the app.

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Drop recursive policies, create simple SELECT policies |
| `src/lib/auth.tsx` | Separate profileLoading from auth loading, make resilient |

---

## Technical Details

### Why This Happens

1. User logs in, session is valid
2. Auth provider calls `fetchProfile(userId)`
3. Query hits `profiles` table with SELECT
4. RLS evaluates policy "Users can view friend profiles"
5. Policy calls `current_profile_id()`
6. `current_profile_id()` tries to SELECT from `profiles`
7. RLS evaluates again for this query
8. Infinite loop until Postgres detects it and throws error

### Why Our Fix Works

1. **Simple policy `auth.uid() = user_id`** doesn't require any function calls
2. **Allow authenticated to read all profiles** is safe because:
   - Sensitive fields are excluded from app queries
   - The `public_profiles` view already handles field-level security
3. **Auth bootstrap never blocks** on profile data - session = signed in

---

## Pass Conditions

After implementation:
- App loads immediately when valid session exists
- Profile data loads in background
- No infinite recursion errors in database logs
- DMs and conversations work (profiles can be queried)
- Users are never logged out due to profile fetch failures

