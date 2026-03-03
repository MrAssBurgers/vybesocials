-- Fix 1: legal_acceptances needs UPDATE policy for upsert
CREATE POLICY "Users can update own acceptances"
ON public.legal_acceptances
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix 2: conversations INSERT policy - use auth.uid() mapped to profile
-- The current policy uses created_by = current_profile_id() which should work,
-- but let's also add a more permissive check for group creation
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Users can create conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (created_by = public.current_profile_id());