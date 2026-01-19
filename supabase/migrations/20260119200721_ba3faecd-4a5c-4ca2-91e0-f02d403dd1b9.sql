-- STEP 1: Add referral_inviter_id column to profiles
-- This tracks who invited each user (one-time, immutable once set)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS referral_inviter_id uuid REFERENCES public.profiles(id);

-- Index for efficient leaderboard queries
CREATE INDEX IF NOT EXISTS idx_profiles_referral_inviter 
ON public.profiles(referral_inviter_id) 
WHERE referral_inviter_id IS NOT NULL;

-- STEP 2: Create leaderboard view
CREATE OR REPLACE VIEW public.invite_leaderboard AS
SELECT 
  p.id as profile_id,
  p.username,
  p.avatar_url,
  p.display_name,
  COUNT(invited.id) as invite_count,
  RANK() OVER (ORDER BY COUNT(invited.id) DESC) as rank
FROM public.profiles p
INNER JOIN public.profiles invited ON invited.referral_inviter_id = p.id
GROUP BY p.id, p.username, p.avatar_url, p.display_name
HAVING COUNT(invited.id) > 0
ORDER BY invite_count DESC;

-- Grant access to the view
GRANT SELECT ON public.invite_leaderboard TO authenticated;
GRANT SELECT ON public.invite_leaderboard TO anon;