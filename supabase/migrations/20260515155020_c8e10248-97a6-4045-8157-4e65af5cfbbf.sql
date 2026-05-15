
-- Provider enum (extensible for Apple Music later)
DO $$ BEGIN
  CREATE TYPE public.music_provider AS ENUM ('spotify', 'apple_music');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Spotify connections (private tokens)
CREATE TABLE IF NOT EXISTS public.spotify_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_user_id TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.spotify_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read spotify_connections"
  ON public.spotify_connections FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "owner delete spotify_connections"
  ON public.spotify_connections FOR DELETE
  USING (auth.uid() = user_id);
-- Inserts/updates happen only via edge functions using the service-role key.

-- 2. Live music presence (publicly readable, gated client-side by music_settings)
CREATE TABLE IF NOT EXISTS public.live_music_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  provider public.music_provider NOT NULL DEFAULT 'spotify',
  track_id TEXT,
  title TEXT,
  artist TEXT,
  album TEXT,
  album_art_url TEXT,
  duration_ms INTEGER,
  progress_ms INTEGER,
  track_url TEXT,
  is_playing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.live_music_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone read live_music_presence"
  ON public.live_music_presence FOR SELECT
  TO authenticated
  USING (true);
CREATE POLICY "owner upsert live_music_presence"
  ON public.live_music_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner update live_music_presence"
  ON public.live_music_presence FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "owner delete live_music_presence"
  ON public.live_music_presence FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE public.live_music_presence REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_music_presence;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. Music privacy settings
CREATE TABLE IF NOT EXISTS public.music_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  show_listening_activity BOOLEAN NOT NULL DEFAULT true,
  show_on_profile BOOLEAN NOT NULL DEFAULT true,
  show_in_dms BOOLEAN NOT NULL DEFAULT true,
  hide_when_invisible BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.music_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read music_settings"
  ON public.music_settings FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "owner write music_settings"
  ON public.music_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner update music_settings"
  ON public.music_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS spotify_connections_touch ON public.spotify_connections;
CREATE TRIGGER spotify_connections_touch BEFORE UPDATE ON public.spotify_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS live_music_presence_touch ON public.live_music_presence;
CREATE TRIGGER live_music_presence_touch BEFORE UPDATE ON public.live_music_presence
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS music_settings_touch ON public.music_settings;
CREATE TRIGGER music_settings_touch BEFORE UPDATE ON public.music_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
