
-- FIX 2: Recreate public_profiles view with coins_balance masked
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles WITH (security_invoker = true) AS
SELECT id,
    user_id,
    username,
    display_name,
    avatar_url,
    bio,
    link_url,
    location,
    is_private,
    is_verified,
    interests,
    language,
    timezone,
    CASE WHEN (auth.uid() = user_id) THEN coins_balance ELSE NULL::integer END AS coins_balance,
    created_at,
    onboarding_completed,
    tutorial_completed,
    tutorial_skipped,
    intro_completed,
    badge_settings,
    CASE WHEN (auth.uid() = user_id) THEN email ELSE NULL::text END AS email,
    CASE WHEN (auth.uid() = user_id) THEN phone_number ELSE NULL::text END AS phone_number,
    CASE WHEN (auth.uid() = user_id) THEN phone_verified ELSE NULL::boolean END AS phone_verified,
    CASE WHEN (auth.uid() = user_id) THEN first_name ELSE NULL::text END AS first_name,
    CASE WHEN (auth.uid() = user_id) THEN last_name ELSE NULL::text END AS last_name,
    CASE WHEN (auth.uid() = user_id) THEN date_of_birth ELSE NULL::date END AS date_of_birth,
    CASE WHEN (auth.uid() = user_id) THEN age_verified ELSE NULL::boolean END AS age_verified,
    CASE WHEN (auth.uid() = user_id) THEN sensitivity_preference ELSE NULL::text END AS sensitivity_preference,
    CASE WHEN (auth.uid() = user_id) THEN referral_inviter_id ELSE NULL::uuid END AS referral_inviter_id
FROM profiles;

-- Grant access
GRANT SELECT ON public.public_profiles TO authenticated;
GRANT SELECT ON public.public_profiles TO anon;
