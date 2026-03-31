
-- Drop existing FK so we can re-add after cleanup
ALTER TABLE public.creator_profiles
DROP CONSTRAINT IF EXISTS creator_profiles_user_id_profiles_fkey;

-- Clean up orphaned creator_profiles rows
DELETE FROM public.creator_profiles
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- Re-add FK
ALTER TABLE public.creator_profiles
ADD CONSTRAINT creator_profiles_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
