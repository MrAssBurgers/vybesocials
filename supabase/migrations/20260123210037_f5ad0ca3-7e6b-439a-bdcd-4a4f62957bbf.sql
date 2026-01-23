-- Fix RLS: Allow any authenticated user to scan (update) a pending drop
-- The issue is that scanners can't update the drop because they don't own it yet

-- Drop the existing update policy
DROP POLICY IF EXISTS "Users can update own drops" ON friend_drops;

-- Create new update policy that allows:
-- 1. Owner to update their own drops
-- 2. Any authenticated user to scan a PENDING drop (first scan sets to_user_id)
CREATE POLICY "Users can update drops" ON friend_drops
FOR UPDATE
USING (
  from_user_id = current_profile_id() 
  OR to_user_id = current_profile_id()
  OR (status = 'pending' AND to_user_id IS NULL)
)
WITH CHECK (
  from_user_id = current_profile_id() 
  OR to_user_id = current_profile_id()
  OR (status = 'scanned')
);

-- Also allow authenticated users to read pending drops (for scanning)
DROP POLICY IF EXISTS "Users can view own drops" ON friend_drops;

CREATE POLICY "Users can view drops" ON friend_drops
FOR SELECT
USING (
  from_user_id = current_profile_id() 
  OR to_user_id = current_profile_id()
  OR (status = 'pending' AND to_user_id IS NULL)
);