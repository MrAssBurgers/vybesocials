
-- 1. Add FK from creator_profiles.user_id to profiles.id (for PostgREST joins)
ALTER TABLE public.creator_profiles
ADD CONSTRAINT creator_profiles_user_id_profiles_fkey
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Create reaction_mood_profiles view for get_ranked_feed RPC
CREATE OR REPLACE VIEW public.reaction_mood_profiles AS
SELECT
  l.user_id,
  CASE l.reaction_type
    WHEN 'haha' THEN 'funny'
    WHEN 'wow' THEN 'shocking'
    WHEN 'sad' THEN 'emotional'
    WHEN 'angry' THEN 'controversial'
    WHEN 'love' THEN 'heartwarming'
    WHEN 'care' THEN 'supportive'
    ELSE 'general'
  END AS mood,
  COUNT(*)::numeric AS score
FROM public.likes l
WHERE l.reaction_type IS NOT NULL
GROUP BY l.user_id, 
  CASE l.reaction_type
    WHEN 'haha' THEN 'funny'
    WHEN 'wow' THEN 'shocking'
    WHEN 'sad' THEN 'emotional'
    WHEN 'angry' THEN 'controversial'
    WHEN 'love' THEN 'heartwarming'
    WHEN 'care' THEN 'supportive'
    ELSE 'general'
  END;
