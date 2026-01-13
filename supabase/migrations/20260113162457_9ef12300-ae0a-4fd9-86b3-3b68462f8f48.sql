-- Fix story likes RLS: story_likes.user_id references public.profiles(id), not auth.users.
-- Policies must map auth.uid() -> profiles.id.

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can like stories" ON public.story_likes;
DROP POLICY IF EXISTS "Users can unlike stories" ON public.story_likes;
DROP POLICY IF EXISTS "Story owners and likers can view likes" ON public.story_likes;

CREATE POLICY "Users can like stories"
ON public.story_likes
FOR INSERT
TO public
WITH CHECK (
  user_id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Users can unlike stories"
ON public.story_likes
FOR DELETE
TO public
USING (
  user_id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Story owners and likers can view likes"
ON public.story_likes
FOR SELECT
TO public
USING (
  -- the liker can see their own like row
  user_id IN (
    SELECT p.id
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
  OR
  -- the story owner can see all likes on their stories
  story_id IN (
    SELECT s.id
    FROM public.stories s
    WHERE s.author_id IN (
      SELECT p.id
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
    )
  )
);

-- Optional performance: ensure the unique constraint exists (usually already)
-- (no-op if it exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'story_likes_story_id_user_id_key'
      AND conrelid = 'public.story_likes'::regclass
  ) THEN
    ALTER TABLE public.story_likes
      ADD CONSTRAINT story_likes_story_id_user_id_key UNIQUE (story_id, user_id);
  END IF;
END $$;