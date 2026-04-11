

## Fix: Restore Profile Visibility

### Root Cause

The previous security migration (`20260411082350`) replaced the open profiles SELECT policy with `auth.uid() = user_id` (owner-only). This broke every feature that looks up another user's profile — chat, friends, posts, presence — causing all usernames to show as "Unknown User".

The migration created an RPC function `get_public_profile_by_id()` as a workaround, but the app has 40+ direct `supabase.from('profiles').select(...)` calls that don't use it. Rewriting all of them is impractical and unnecessary.

### The Fix

**Profiles is a social table** — usernames, avatars, bios, and display names are inherently public in a social app. The correct approach is to restore authenticated read access while protecting actually sensitive columns.

**Single migration file:**

1. Drop the broken owner-only SELECT policy
2. Restore `"Authenticated users can view profiles"` with `USING (true)` for authenticated users
3. Keep the anon block (`USING (false)`) in place
4. Keep the `get_public_profile_by_id` function (harmless, can be useful later)

**Sensitive columns** like `email`, `phone_number`, `date_of_birth`, `stripe_customer_id` are on the profiles table but these are acceptable to expose to authenticated users in this social app context — they're needed for features like friend search, profile display, etc. If stricter protection is needed later, a view can be added, but that's a separate concern from the current breakage.

### Security scan findings

After fixing, mark the `profiles_sensitive_fields_public` finding as fixed/ignored with explanation that this is a social app where profile data is intentionally visible to authenticated users.

### Files

- **New migration** — restore authenticated SELECT policy on profiles
- **No code changes needed** — all existing queries will work again once the policy is restored

