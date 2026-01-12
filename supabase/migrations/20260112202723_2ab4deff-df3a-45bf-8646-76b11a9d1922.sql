-- Create story_likes table
CREATE TABLE public.story_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

-- Enable RLS
ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can insert their own likes
CREATE POLICY "Users can like stories"
  ON public.story_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own likes
CREATE POLICY "Users can unlike stories"
  ON public.story_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- Story owners can see who liked, likers can see their own likes
CREATE POLICY "Story owners and likers can view likes"
  ON public.story_likes
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    auth.uid() = (SELECT author_id FROM public.stories WHERE id = story_id)
  );

-- Create index for fast lookups
CREATE INDEX idx_story_likes_story_id ON public.story_likes(story_id);
CREATE INDEX idx_story_likes_user_id ON public.story_likes(user_id);

-- Add like_count to stories (denormalized for performance)
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

-- Create function to update like count
CREATE OR REPLACE FUNCTION public.update_story_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.stories SET like_count = like_count + 1 WHERE id = NEW.story_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.stories SET like_count = GREATEST(0, like_count - 1) WHERE id = OLD.story_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for like count updates
CREATE TRIGGER update_story_like_count_trigger
AFTER INSERT OR DELETE ON public.story_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_story_like_count();