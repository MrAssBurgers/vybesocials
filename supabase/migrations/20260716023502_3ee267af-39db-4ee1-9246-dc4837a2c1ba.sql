DROP POLICY IF EXISTS "e2e_read_all" ON public.e2e_device_keys;

CREATE POLICY "e2e_read_conversation_members"
ON public.e2e_device_keys
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.conversation_members cm_self
    JOIN public.profiles p_self ON p_self.id = cm_self.user_id
    JOIN public.conversation_members cm_other ON cm_other.conversation_id = cm_self.conversation_id
    JOIN public.profiles p_other ON p_other.id = cm_other.user_id
    WHERE p_self.user_id = auth.uid()
      AND p_other.user_id = e2e_device_keys.user_id
  )
);