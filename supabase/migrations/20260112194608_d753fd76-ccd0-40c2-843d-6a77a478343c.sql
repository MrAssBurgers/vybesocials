-- Fix the overly permissive INSERT policy - only allow inserts through the trigger (SECURITY DEFINER)
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.server_notifications;

-- Create a more restrictive INSERT policy - inserts happen via SECURITY DEFINER trigger
-- We allow service role / trigger to insert, users cannot directly insert
CREATE POLICY "Only system can insert server notifications"
ON public.server_notifications
FOR INSERT
WITH CHECK (false);