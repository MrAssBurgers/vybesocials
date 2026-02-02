-- Fix ai_brief_preferences to use profile IDs instead of auth user IDs

-- Step A: Drop the old foreign key that references auth.users
ALTER TABLE public.ai_brief_preferences 
DROP CONSTRAINT IF EXISTS ai_brief_preferences_user_id_fkey;

-- Step B: Migrate existing rows from auth user IDs to profile IDs
-- This maps old auth.users.id values to the corresponding profiles.id
UPDATE public.ai_brief_preferences abp
SET user_id = p.id
FROM public.profiles p
WHERE p.user_id = abp.user_id;

-- Delete any orphaned rows that couldn't be mapped (no matching profile)
DELETE FROM public.ai_brief_preferences
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- Step C: Add the correct foreign key referencing profiles
ALTER TABLE public.ai_brief_preferences
ADD CONSTRAINT ai_brief_preferences_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Step D: Recreate RLS policies with TO authenticated for proper security

-- Drop existing policies
DROP POLICY IF EXISTS "Users can read their own preferences" ON public.ai_brief_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.ai_brief_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.ai_brief_preferences;

-- Create new policies that use current_profile_id() and restrict to authenticated users
CREATE POLICY "Users can read their own preferences" 
ON public.ai_brief_preferences 
FOR SELECT 
TO authenticated
USING (user_id = current_profile_id());

CREATE POLICY "Users can insert their own preferences" 
ON public.ai_brief_preferences 
FOR INSERT 
TO authenticated
WITH CHECK (user_id = current_profile_id());

CREATE POLICY "Users can update their own preferences" 
ON public.ai_brief_preferences 
FOR UPDATE 
TO authenticated
USING (user_id = current_profile_id())
WITH CHECK (user_id = current_profile_id());