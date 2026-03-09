-- ============================================
-- SOUNDS SYSTEM - Core Tables
-- ============================================

-- Main sounds library table
CREATE TABLE IF NOT EXISTS public.sounds (
  sound_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT 'Unknown Artist',
  uploader_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  audio_url TEXT NOT NULL,
  preview_url TEXT,
  cover_url TEXT,
  duration FLOAT NOT NULL DEFAULT 0,
  waveform_data JSONB,
  usage_count INTEGER NOT NULL DEFAULT 0,
  trend_score FLOAT NOT NULL DEFAULT 0,
  original_video_id UUID,
  original_creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_extracted BOOLEAN NOT NULL DEFAULT false,
  is_original BOOLEAN NOT NULL DEFAULT true,
  tags TEXT[],
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_explicit BOOLEAN NOT NULL DEFAULT false,
  moderation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sound analytics tracking table
CREATE TABLE IF NOT EXISTS public.sound_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sound_id UUID NOT NULL REFERENCES public.sounds(sound_id) ON DELETE CASCADE,
  plays INTEGER NOT NULL DEFAULT 0,
  videos_created INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  avg_watch_time FLOAT NOT NULL DEFAULT 0,
  growth_rate FLOAT NOT NULL DEFAULT 0,
  plays_last_24h INTEGER NOT NULL DEFAULT 0,
  plays_last_7d INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User saved sounds
CREATE TABLE IF NOT EXISTS public.user_saved_sounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  sound_id UUID NOT NULL REFERENCES public.sounds(sound_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, sound_id)
);

-- Sound play events for trending calculation
CREATE TABLE IF NOT EXISTS public.sound_play_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sound_id UUID NOT NULL REFERENCES public.sounds(sound_id) ON DELETE CASCADE,
  user_id UUID,
  context TEXT DEFAULT 'feed',
  watch_duration FLOAT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sounds', 
  'sounds', 
  true,
  52428800, -- 50MB limit
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sounds_trend_score ON public.sounds(trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_sounds_usage_count ON public.sounds(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_sounds_created_at ON public.sounds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sounds_uploader ON public.sounds(uploader_id);
CREATE INDEX IF NOT EXISTS idx_sounds_approved ON public.sounds(is_approved, trend_score DESC);
CREATE INDEX IF NOT EXISTS idx_sound_analytics_sound_id ON public.sound_analytics(sound_id);
CREATE INDEX IF NOT EXISTS idx_sound_play_events_sound_id ON public.sound_play_events(sound_id);
CREATE INDEX IF NOT EXISTS idx_sound_play_events_created ON public.sound_play_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_saved_sounds_user ON public.user_saved_sounds(user_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_sounds_sound ON public.user_saved_sounds(sound_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.sounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sound_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_saved_sounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sound_play_events ENABLE ROW LEVEL SECURITY;

-- Sounds: public can view approved sounds
CREATE POLICY "Approved sounds are publicly viewable"
  ON public.sounds FOR SELECT
  USING (is_approved = true OR uploader_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- Sounds: authenticated users can upload
CREATE POLICY "Authenticated users can upload sounds"
  ON public.sounds FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    uploader_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

-- Sounds: uploaders can update their own
CREATE POLICY "Uploaders can update their sounds"
  ON public.sounds FOR UPDATE
  USING (uploader_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Sounds: uploaders can delete their own
CREATE POLICY "Uploaders can delete their sounds"
  ON public.sounds FOR DELETE
  USING (uploader_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Sound analytics: read by anyone
CREATE POLICY "Sound analytics are publicly viewable"
  ON public.sound_analytics FOR SELECT
  USING (true);

-- Sound analytics: insert/update by service (edge functions handle this)
CREATE POLICY "System can insert sound analytics"
  ON public.sound_analytics FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- User saved sounds: users can view and manage their own
CREATE POLICY "Users can view their saved sounds"
  ON public.user_saved_sounds FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can save sounds"
  ON public.user_saved_sounds FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave sounds"
  ON public.user_saved_sounds FOR DELETE
  USING (auth.uid() = user_id);

-- Sound play events: authenticated users can insert
CREATE POLICY "Authenticated users can log sound plays"
  ON public.sound_play_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view sound play events"
  ON public.sound_play_events FOR SELECT
  USING (true);

-- ============================================
-- STORAGE POLICIES
-- ============================================

CREATE POLICY "Sounds are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sounds');

CREATE POLICY "Authenticated users can upload sounds"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'sounds' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own sounds"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'sounds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own sounds"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'sounds' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION public.update_sounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_sounds_updated_at
  BEFORE UPDATE ON public.sounds
  FOR EACH ROW EXECUTE FUNCTION public.update_sounds_updated_at();

-- Function to increment sound usage count when a video is created with a sound
CREATE OR REPLACE FUNCTION public.increment_sound_usage(p_sound_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.sounds
  SET usage_count = usage_count + 1,
      updated_at = now()
  WHERE sound_id = p_sound_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to update trend_score based on recent play events
CREATE OR REPLACE FUNCTION public.update_sound_trend_scores()
RETURNS void AS $$
BEGIN
  UPDATE public.sounds s
  SET trend_score = (
    -- Base: recent 24h plays (heavily weighted)
    (SELECT COUNT(*) FROM public.sound_play_events spe 
     WHERE spe.sound_id = s.sound_id 
     AND spe.created_at > NOW() - INTERVAL '24 hours') * 3.0
    +
    -- 7d plays (medium weight)
    (SELECT COUNT(*) FROM public.sound_play_events spe 
     WHERE spe.sound_id = s.sound_id 
     AND spe.created_at > NOW() - INTERVAL '7 days') * 0.5
    +
    -- Total usage count (small baseline weight)
    s.usage_count * 0.1
  ),
  updated_at = now()
  WHERE s.is_approved = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;