-- Fix security definer view issue
-- Recreate view with SECURITY INVOKER (default but being explicit)
DROP VIEW IF EXISTS public.invite_leaderboard;

CREATE VIEW public.invite_leaderboard 
WITH (security_invoker = true)
AS
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

-- Grant access
GRANT SELECT ON public.invite_leaderboard TO authenticated;
GRANT SELECT ON public.invite_leaderboard TO anon;