

## Fix publish failure and database errors

### Root cause

1. **Publish failure** — Migration `20260410005158` tries `CREATE OR REPLACE FUNCTION add_user_xp(uuid, integer) RETURNS void`, but on production the existing function returns `jsonb` (not `void`). Postgres forbids changing return types with `CREATE OR REPLACE`. The `DROP FUNCTION` only exists in the later migration `20260410010248`, which never runs because the earlier one fails first.

2. **`column "xp" does not exist`** — There's a second overload `add_user_xp(uuid, integer, text)` that still does `UPDATE profiles SET xp = ...`. The `profiles` table has no `xp` column. One callsite (`useBugBountyDetector.ts`) uses this 3-arg version.

3. **`user_backgrounds` timeout** — The RLS policies use `current_profile_id()` which queries `profiles`. With only 7 rows this shouldn't timeout; likely a transient issue, but I'll verify indexes are in place.

4. **`user_locations` FK** — The FK constraint `user_locations_user_id_fkey` still doesn't exist on prod because the migration that adds it fails before reaching that line.

### Plan

**Step 1 — Fix both migration files**

Replace `20260410005158` with:
```sql
-- Drop ALL overloads of add_user_xp first
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer);
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer, text);

-- Recreate 2-arg version targeting user_levels
CREATE OR REPLACE FUNCTION public.add_user_xp(p_user_id uuid, p_xp integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_result jsonb;
BEGIN
  INSERT INTO public.user_levels (user_id, total_xp, current_level)
  VALUES (p_user_id, p_xp, 1)
  ON CONFLICT (user_id)
  DO UPDATE SET total_xp = user_levels.total_xp + p_xp, updated_at = now();
  
  SELECT jsonb_build_object('success', true, 'xp_added', p_xp) INTO v_result;
  RETURN v_result;
END;
$$;

-- Add FK from user_locations to profiles (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'user_locations_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END; $$;
```

Replace `20260410010248` with just a comment/no-op since everything is handled by the earlier migration:
```sql
-- Consolidated into previous migration; no-op
SELECT 1;
```

I'm keeping the return type as `jsonb` to match what production callers expect, and making the function work with `user_levels` instead of `profiles.xp`.

**Step 2 — Fix the `upload-sound` edge function**

The edge function uses `p_xp_amount` (the old param name). Update it to use `p_xp`.

**Step 3 — Verify `user_backgrounds`**

Check if there's an index on `profiles.user_id` that `current_profile_id()` relies on. Add one if missing to prevent timeout.

### Files to change
- `supabase/migrations/20260410005158_7e2af4e9-7643-4e5e-a0bf-c32902c0176d.sql`
- `supabase/migrations/20260410010248_e4a81f99-a60c-414e-bbd8-d5149a35cff4.sql`
- `supabase/functions/upload-sound/index.ts` (fix param name)

