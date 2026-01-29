-- Create user_custom_sounds table for custom ringtones
CREATE TABLE public.user_custom_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sound_type TEXT NOT NULL CHECK (sound_type IN ('message_tone', 'call_ringtone')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  duration_seconds NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, sound_type)
);

-- Enable Row Level Security
ALTER TABLE public.user_custom_sounds ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own sounds" 
ON public.user_custom_sounds 
FOR SELECT 
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can create their own sounds" 
ON public.user_custom_sounds 
FOR INSERT 
WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update their own sounds" 
ON public.user_custom_sounds 
FOR UPDATE 
USING (user_id = public.current_profile_id());

CREATE POLICY "Users can delete their own sounds" 
ON public.user_custom_sounds 
FOR DELETE 
USING (user_id = public.current_profile_id());

-- Create storage bucket for custom sounds (private, user-scoped)
INSERT INTO storage.buckets (id, name, public)
VALUES ('custom-sounds', 'custom-sounds', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for custom sounds bucket
CREATE POLICY "Users can view their own custom sounds"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'custom-sounds' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload their own custom sounds"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'custom-sounds' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own custom sounds"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'custom-sounds' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own custom sounds"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'custom-sounds' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);