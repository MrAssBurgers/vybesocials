-- push_tokens upsert needs UPDATE, not just INSERT/DELETE
DROP POLICY IF EXISTS "Users can update their tokens" ON public.push_tokens;
CREATE POLICY "Users can update their tokens"
  ON public.push_tokens
  FOR UPDATE
  USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() OR id = auth.uid()));
