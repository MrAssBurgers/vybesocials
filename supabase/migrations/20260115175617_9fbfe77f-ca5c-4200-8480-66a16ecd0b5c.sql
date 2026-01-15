-- Create table for meme ban backgrounds
CREATE TABLE public.meme_ban_backgrounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  gif_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.meme_ban_backgrounds ENABLE ROW LEVEL SECURITY;

-- Everyone can view active backgrounds (needed for ban screen)
CREATE POLICY "Anyone can view active meme ban backgrounds"
ON public.meme_ban_backgrounds
FOR SELECT
USING (is_active = true);

-- Only owner can manage backgrounds (username = mrassburgers)
CREATE POLICY "Owner can manage meme ban backgrounds"
ON public.meme_ban_backgrounds
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND lower(username) = 'mrassburgers'
  )
);

-- Insert the default Among Us background
INSERT INTO public.meme_ban_backgrounds (name, gif_url, is_active, is_default)
VALUES ('Among Us Twerk', 'https://media1.tenor.com/m/jUMex_rdqPwAAAAC/among-us-twerk.gif', true, true);