-- Add profanity flag to posts for content filtering (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'has_profanity') THEN
    ALTER TABLE public.posts ADD COLUMN has_profanity BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Index for faster content filtering queries
CREATE INDEX IF NOT EXISTS idx_posts_has_profanity ON public.posts(has_profanity);

-- Index for faster VYBE viewed_at queries on message_views
CREATE INDEX IF NOT EXISTS idx_message_views_message_id ON public.message_views(message_id);

-- Ensure realtime is enabled for message updates (for VYBE opened status)
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_views;