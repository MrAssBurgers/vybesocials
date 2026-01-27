-- Create user_backgrounds table for storing user's background image library
CREATE TABLE IF NOT EXISTS public.user_backgrounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  name TEXT,
  storage_path TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_backgrounds_user_id ON public.user_backgrounds(user_id);
CREATE INDEX IF NOT EXISTS idx_user_backgrounds_active ON public.user_backgrounds(user_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.user_backgrounds ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own backgrounds"
  ON public.user_backgrounds FOR SELECT
  USING (user_id = public.current_profile_id());

CREATE POLICY "Users can insert their own backgrounds"
  ON public.user_backgrounds FOR INSERT
  WITH CHECK (user_id = public.current_profile_id());

CREATE POLICY "Users can update their own backgrounds"
  ON public.user_backgrounds FOR UPDATE
  USING (user_id = public.current_profile_id());

CREATE POLICY "Users can delete their own backgrounds"
  ON public.user_backgrounds FOR DELETE
  USING (user_id = public.current_profile_id());

-- Function to set active background (deactivates others)
CREATE OR REPLACE FUNCTION public.set_active_background(p_background_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deactivate all backgrounds for this user
  UPDATE public.user_backgrounds 
  SET is_active = false, updated_at = now()
  WHERE user_id = current_profile_id();
  
  -- Activate the selected background
  UPDATE public.user_backgrounds 
  SET is_active = true, updated_at = now()
  WHERE id = p_background_id AND user_id = current_profile_id();
END;
$$;

-- Enable realtime for backgrounds
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_backgrounds;