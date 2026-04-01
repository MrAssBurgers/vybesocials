-- 3. PUBLIC_PROFILES: Must DROP+CREATE to change column order with security_invoker
DROP VIEW IF EXISTS public.public_profiles CASCADE;
CREATE VIEW public.public_profiles
WITH (security_invoker = on) AS
SELECT
  id, user_id, username, display_name, avatar_url, bio, link_url, location,
  is_private, is_verified, interests, language, timezone,
  CASE WHEN auth.uid() = user_id THEN coins_balance ELSE NULL END AS coins_balance,
  created_at,
  onboarding_completed, tutorial_completed, tutorial_skipped, intro_completed, badge_settings,
  CASE WHEN auth.uid() = user_id THEN email ELSE NULL END AS email,
  CASE WHEN auth.uid() = user_id THEN phone_number ELSE NULL END AS phone_number,
  CASE WHEN auth.uid() = user_id THEN phone_verified ELSE NULL END AS phone_verified,
  CASE WHEN auth.uid() = user_id THEN first_name ELSE NULL END AS first_name,
  CASE WHEN auth.uid() = user_id THEN last_name ELSE NULL END AS last_name,
  CASE WHEN auth.uid() = user_id THEN date_of_birth ELSE NULL END AS date_of_birth,
  CASE WHEN auth.uid() = user_id THEN age_verified ELSE NULL END AS age_verified,
  CASE WHEN auth.uid() = user_id THEN sensitivity_preference ELSE NULL END AS sensitivity_preference,
  CASE WHEN auth.uid() = user_id THEN referral_inviter_id ELSE NULL END AS referral_inviter_id
FROM public.profiles;

-- 4a. reaction_mood_profiles: security definer -> security invoker
DROP VIEW IF EXISTS public.reaction_mood_profiles CASCADE;
CREATE VIEW public.reaction_mood_profiles
WITH (security_invoker = on) AS
SELECT user_id,
  CASE reaction_type
    WHEN 'haha' THEN 'funny' WHEN 'wow' THEN 'shocking' WHEN 'sad' THEN 'emotional'
    WHEN 'angry' THEN 'controversial' WHEN 'love' THEN 'heartwarming' WHEN 'care' THEN 'supportive'
    ELSE 'general'
  END AS mood,
  count(*)::numeric AS score
FROM public.likes l WHERE reaction_type IS NOT NULL
GROUP BY user_id, (CASE reaction_type
    WHEN 'haha' THEN 'funny' WHEN 'wow' THEN 'shocking' WHEN 'sad' THEN 'emotional'
    WHEN 'angry' THEN 'controversial' WHEN 'love' THEN 'heartwarming' WHEN 'care' THEN 'supportive'
    ELSE 'general' END);

-- 4b. xp_leaderboard: security definer -> security invoker
DROP VIEW IF EXISTS public.xp_leaderboard CASCADE;
CREATE VIEW public.xp_leaderboard
WITH (security_invoker = on) AS
SELECT ul.user_id, p.id AS profile_id, ul.total_xp, ul.current_level,
  p.username, p.display_name, p.avatar_url, p.is_verified,
  rank() OVER (ORDER BY ul.total_xp DESC) AS rank
FROM public.user_levels ul JOIN public.profiles p ON p.user_id = ul.user_id
WHERE ul.total_xp > 0 ORDER BY ul.total_xp DESC;

-- 5. Document intentional default-deny tables
COMMENT ON TABLE public.password_reset_tokens IS 'RLS default-deny: accessed only via service_role in edge functions';
COMMENT ON TABLE public.rate_limits IS 'RLS default-deny: accessed only via service_role in edge functions';