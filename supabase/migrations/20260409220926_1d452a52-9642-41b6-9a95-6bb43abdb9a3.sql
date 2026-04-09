-- Drop the old 2-arg add_user_xp that references profiles.xp (which doesn't exist)
DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer);
