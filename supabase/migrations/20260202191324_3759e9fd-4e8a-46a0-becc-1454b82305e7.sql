-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.ai_brief_preferences;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.ai_brief_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.ai_brief_preferences;

-- Create new policies using current_profile_id() to match profile.id
CREATE POLICY "Users can view their own preferences" 
ON public.ai_brief_preferences 
FOR SELECT 
USING (user_id = current_profile_id());

CREATE POLICY "Users can insert their own preferences" 
ON public.ai_brief_preferences 
FOR INSERT 
WITH CHECK (user_id = current_profile_id());

CREATE POLICY "Users can update their own preferences" 
ON public.ai_brief_preferences 
FOR UPDATE 
USING (user_id = current_profile_id())
WITH CHECK (user_id = current_profile_id());