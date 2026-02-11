
-- Remove the overly permissive anon SELECT policy on profiles
-- Anon users should not be able to read profile data including emails, phone numbers, etc.
DROP POLICY IF EXISTS "Anon can view public profiles" ON public.profiles;

-- The existing "Authenticated users can read profiles" and "Users can view own profile" 
-- policies remain to support app functionality.
-- Sensitive fields are protected via the public_profiles view for external-facing queries.
