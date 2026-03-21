
ALTER TABLE public.posts 
  ADD COLUMN IF NOT EXISTS is_ai_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_confidence real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_override boolean DEFAULT null;

COMMENT ON COLUMN public.posts.is_ai_generated IS 'Whether AI detection flagged this content as AI-generated';
COMMENT ON COLUMN public.posts.ai_confidence IS 'AI detection confidence score 0-1';
COMMENT ON COLUMN public.posts.ai_override IS 'User override: null=no override, true=user confirms AI, false=user disputes AI label';
