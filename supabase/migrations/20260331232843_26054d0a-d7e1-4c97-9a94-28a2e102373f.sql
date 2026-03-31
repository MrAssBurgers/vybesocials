-- Fix broken creator_profiles -> profiles relationship
-- creator_profiles.user_id stores the auth user id and must reference profiles.user_id, not profiles.id

ALTER TABLE public.creator_profiles
DROP CONSTRAINT IF EXISTS creator_profiles_user_id_profiles_fkey;

ALTER TABLE public.creator_profiles
ADD CONSTRAINT creator_profiles_user_id_profiles_user_id_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;