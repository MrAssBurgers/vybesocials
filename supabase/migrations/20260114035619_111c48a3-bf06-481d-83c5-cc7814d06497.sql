-- Fix RLS policies for shared_themes to use profile ID mapping
-- The foreign key references profiles.id, so we need RLS to check the profile relationship

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create shared themes" ON public.shared_themes;
DROP POLICY IF EXISTS "Users can delete their own shared themes" ON public.shared_themes;
DROP POLICY IF EXISTS "Users can update their own shared themes" ON public.shared_themes;

-- Create new policies that check against profiles table
CREATE POLICY "Users can create shared themes" 
ON public.shared_themes 
FOR INSERT 
WITH CHECK (
  creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete their own shared themes" 
ON public.shared_themes 
FOR DELETE 
USING (
  creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their own shared themes" 
ON public.shared_themes 
FOR UPDATE 
USING (
  creator_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Also fix saved_themes and theme_likes to use profile ID
DROP POLICY IF EXISTS "Users can save themes" ON public.saved_themes;
DROP POLICY IF EXISTS "Users can unsave themes" ON public.saved_themes;
DROP POLICY IF EXISTS "Users can view their saved themes" ON public.saved_themes;

CREATE POLICY "Users can save themes" 
ON public.saved_themes 
FOR INSERT 
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can unsave themes" 
ON public.saved_themes 
FOR DELETE 
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can view their saved themes" 
ON public.saved_themes 
FOR SELECT 
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Fix theme_likes
DROP POLICY IF EXISTS "Users can like themes" ON public.theme_likes;
DROP POLICY IF EXISTS "Users can unlike themes" ON public.theme_likes;

CREATE POLICY "Users can like themes" 
ON public.theme_likes 
FOR INSERT 
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

CREATE POLICY "Users can unlike themes" 
ON public.theme_likes 
FOR DELETE 
USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);