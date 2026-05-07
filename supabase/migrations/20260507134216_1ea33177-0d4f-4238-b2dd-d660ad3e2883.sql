-- Tighten notifications INSERT policy to prevent cross-user spoofing.
-- Cross-user notifications (likes, follows, comments) are created by DB triggers
-- and edge functions using the service role, which bypass RLS.
DROP POLICY IF EXISTS "Users can create notifications as themselves" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON public.notifications;

CREATE POLICY "Users can only notify themselves"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND (actor_id = current_profile_id() OR actor_id IS NULL)
);