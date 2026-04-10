
ALTER TABLE public.user_safety_settings 
ADD COLUMN IF NOT EXISTS dm_content_filter_enabled boolean DEFAULT true;

CREATE TABLE public.user_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stickers"
  ON public.user_stickers FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
