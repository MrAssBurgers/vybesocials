-- Create user_presence table for online status tracking
CREATE TABLE IF NOT EXISTS public.user_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  is_online boolean NOT NULL DEFAULT false,
  UNIQUE(user_id)
);

-- Enable RLS on user_presence
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- Anyone can view online status
CREATE POLICY "Anyone can view user presence"
ON public.user_presence FOR SELECT
TO public
USING (true);

-- Users can manage their own presence
CREATE POLICY "Users can manage own presence"
ON public.user_presence FOR ALL
TO authenticated
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()))
WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Enable realtime for presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;

-- Create feedback table
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('bug', 'feature', 'improvement', 'other')),
  message text NOT NULL,
  likes_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create feedback_likes table for tracking who liked what
CREATE TABLE IF NOT EXISTS public.feedback_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(feedback_id, user_id)
);

-- Enable RLS on feedback tables
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_likes ENABLE ROW LEVEL SECURITY;

-- Anyone can view feedback
CREATE POLICY "Anyone can view feedback"
ON public.feedback FOR SELECT
TO public
USING (true);

-- Authenticated users can create feedback
CREATE POLICY "Authenticated users can create feedback"
ON public.feedback FOR INSERT
TO authenticated
WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Users can update their own feedback
CREATE POLICY "Users can update own feedback"
ON public.feedback FOR UPDATE
TO authenticated
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Admins can update any feedback status
CREATE POLICY "Admins can update feedback status"
ON public.feedback FOR UPDATE
TO authenticated
USING (has_role(current_profile_id(), 'admin') OR has_role(current_profile_id(), 'moderator'));

-- Anyone can view feedback likes
CREATE POLICY "Anyone can view feedback likes"
ON public.feedback_likes FOR SELECT
TO public
USING (true);

-- Authenticated users can like/unlike feedback
CREATE POLICY "Users can like feedback"
ON public.feedback_likes FOR INSERT
TO authenticated
WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can unlike feedback"
ON public.feedback_likes FOR DELETE
TO authenticated
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Create function to update likes count
CREATE OR REPLACE FUNCTION public.update_feedback_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feedback SET likes_count = likes_count + 1 WHERE id = NEW.feedback_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feedback SET likes_count = likes_count - 1 WHERE id = OLD.feedback_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for likes count
CREATE TRIGGER update_feedback_likes_count_trigger
AFTER INSERT OR DELETE ON public.feedback_likes
FOR EACH ROW
EXECUTE FUNCTION public.update_feedback_likes_count();