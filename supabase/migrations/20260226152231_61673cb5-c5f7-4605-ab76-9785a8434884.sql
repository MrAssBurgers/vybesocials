
-- Fix the xp_leaderboard view: join on profiles.user_id (auth id), not profiles.id
CREATE OR REPLACE VIEW public.xp_leaderboard AS
SELECT
  ul.user_id,
  ul.total_xp,
  ul.current_level,
  p.username,
  p.display_name,
  p.avatar_url,
  p.is_verified,
  rank() OVER (ORDER BY ul.total_xp DESC) AS rank
FROM user_levels ul
JOIN profiles p ON p.user_id = ul.user_id
WHERE ul.total_xp > 0
ORDER BY ul.total_xp DESC;
