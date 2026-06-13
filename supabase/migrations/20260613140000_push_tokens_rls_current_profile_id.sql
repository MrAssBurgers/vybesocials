-- push_tokens.user_id stores profiles.id — use current_profile_id() for all RLS (fixes upsert failures).

DROP POLICY IF EXISTS "Users can view their own tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can add their tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can update their tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can delete their tokens" ON public.push_tokens;
DROP POLICY IF EXISTS "Users can manage their own push tokens" ON public.push_tokens;

CREATE POLICY "Users can view their own tokens"
  ON public.push_tokens FOR SELECT
  USING (user_id = current_profile_id());

CREATE POLICY "Users can add their tokens"
  ON public.push_tokens FOR INSERT
  WITH CHECK (user_id = current_profile_id());

CREATE POLICY "Users can update their tokens"
  ON public.push_tokens FOR UPDATE
  USING (user_id = current_profile_id())
  WITH CHECK (user_id = current_profile_id());

CREATE POLICY "Users can delete their tokens"
  ON public.push_tokens FOR DELETE
  USING (user_id = current_profile_id());
