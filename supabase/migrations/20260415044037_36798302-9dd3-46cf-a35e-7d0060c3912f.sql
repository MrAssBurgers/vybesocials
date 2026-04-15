
CREATE TABLE public.user_about (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  mbti TEXT,
  height TEXT,
  favorite_food TEXT,
  music_genres TEXT[] DEFAULT '{}',
  streaming_services TEXT[] DEFAULT '{}',
  now_listening_title TEXT,
  now_listening_artist TEXT,
  now_listening_cover_url TEXT,
  now_listening_service TEXT,
  now_watching_title TEXT,
  now_watching_service TEXT,
  now_watching_cover_url TEXT,
  show_age BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_about ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view user about"
  ON public.user_about FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can insert own about"
  ON public.user_about FOR INSERT TO authenticated
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update own about"
  ON public.user_about FOR UPDATE TO authenticated
  USING (user_id = public.current_profile_id())
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can delete own about"
  ON public.user_about FOR DELETE TO authenticated
  USING (user_id = public.current_profile_id());

CREATE TRIGGER update_user_about_updated_at
  BEFORE UPDATE ON public.user_about
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
