-- Fix conflicting RLS policy on push_tokens table
-- Drop the incorrect policy that compares auth.uid() directly to user_id
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON public.push_tokens;

-- The remaining policies correctly use profile lookup, which is correct