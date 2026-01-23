-- Create table to store user AI brief preferences
CREATE TABLE public.ai_brief_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_topics TEXT[] DEFAULT '{}',
  excluded_topics TEXT[] DEFAULT '{}',
  preferred_sources TEXT[] DEFAULT '{}',
  show_images BOOLEAN DEFAULT true,
  brief_style TEXT DEFAULT 'detailed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_brief_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own preferences" 
ON public.ai_brief_preferences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" 
ON public.ai_brief_preferences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" 
ON public.ai_brief_preferences 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_ai_brief_preferences_updated_at
BEFORE UPDATE ON public.ai_brief_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();