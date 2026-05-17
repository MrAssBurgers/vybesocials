CREATE TABLE IF NOT EXISTS public.external_account_handles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  twitch_login text,
  steam_id text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.external_account_handles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone read external handles"
  ON public.external_account_handles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "owner upsert external handles"
  ON public.external_account_handles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner update external handles"
  ON public.external_account_handles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner delete external handles"
  ON public.external_account_handles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER external_account_handles_touch
  BEFORE UPDATE ON public.external_account_handles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();