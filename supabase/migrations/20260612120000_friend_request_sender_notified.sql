-- Allow senders to mark accepted friend requests as notified (dismiss "X accepted your request" UI)
CREATE POLICY "Senders can mark accepted requests notified"
ON public.friend_requests FOR UPDATE
USING (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND status = 'accepted'
)
WITH CHECK (
  sender_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
