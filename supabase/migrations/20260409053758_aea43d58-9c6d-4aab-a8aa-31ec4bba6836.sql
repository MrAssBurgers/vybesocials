-- Add poll_data column to stories for interactive polls/questions
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS poll_data jsonb DEFAULT NULL;

-- Add index for querying stories with polls
CREATE INDEX IF NOT EXISTS idx_stories_poll_data ON public.stories USING gin(poll_data) WHERE poll_data IS NOT NULL;

-- Create story_poll_votes table to track who voted for what
CREATE TABLE IF NOT EXISTS public.story_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  option_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(story_id, user_id)
);

ALTER TABLE public.story_poll_votes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view votes
CREATE POLICY "Authenticated users can view poll votes"
  ON public.story_poll_votes FOR SELECT
  TO authenticated
  USING (true);

-- Users can cast their own vote
CREATE POLICY "Users can vote on polls"
  ON public.story_poll_votes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can change their vote
CREATE POLICY "Users can update their own vote"
  ON public.story_poll_votes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
