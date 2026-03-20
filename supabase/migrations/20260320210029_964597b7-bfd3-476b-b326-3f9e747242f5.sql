-- Add unique constraint on audio_url to prevent duplicate tracks
CREATE UNIQUE INDEX IF NOT EXISTS sounds_audio_url_unique ON public.sounds (audio_url);
