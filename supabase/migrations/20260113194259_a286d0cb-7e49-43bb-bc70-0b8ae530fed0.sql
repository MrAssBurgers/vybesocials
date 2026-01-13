-- ============================================
-- FIX PROFILES RLS - Allow authenticated users to view basic profile info
-- ============================================

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Users can view own full profile" ON public.profiles;

-- Create policy to allow viewing own full profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

-- Create policy to allow authenticated users to view other profiles (needed for DMs, conversations, etc.)
CREATE POLICY "Authenticated users can view profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- ============================================
-- FIX USER_PRESENCE RLS - Simplify to avoid subquery issues
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view user presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users can manage own presence" ON public.user_presence;

-- Allow anyone to view presence (needed for online status)
CREATE POLICY "Anyone can view presence"
ON public.user_presence FOR SELECT
USING (true);

-- Allow authenticated users to insert/update their own presence
-- Use a direct comparison with current_profile_id() function
CREATE POLICY "Users can insert own presence"
ON public.user_presence FOR INSERT
TO authenticated
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update own presence"
ON public.user_presence FOR UPDATE
TO authenticated
USING (user_id = public.current_profile_id())
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can delete own presence"
ON public.user_presence FOR DELETE
TO authenticated
USING (user_id = public.current_profile_id());

-- ============================================
-- FIX GROUP_CALL_PARTICIPANTS - Fix infinite recursion
-- ============================================

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view group call participants" ON public.group_call_participants;
DROP POLICY IF EXISTS "Users can join group calls" ON public.group_call_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON public.group_call_participants;
DROP POLICY IF EXISTS "Users can leave group calls" ON public.group_call_participants;

-- Create simpler policies using security definer function
CREATE POLICY "View group call participants"
ON public.group_call_participants FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = group_call_participants.call_id
    AND (c.caller_id = public.current_profile_id() OR c.receiver_id = public.current_profile_id())
  )
  OR user_id = public.current_profile_id()
);

CREATE POLICY "Join group calls"
ON public.group_call_participants FOR INSERT
TO authenticated
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Update own call participation"
ON public.group_call_participants FOR UPDATE
TO authenticated
USING (user_id = public.current_profile_id());

CREATE POLICY "Leave group calls"
ON public.group_call_participants FOR DELETE
TO authenticated
USING (user_id = public.current_profile_id());