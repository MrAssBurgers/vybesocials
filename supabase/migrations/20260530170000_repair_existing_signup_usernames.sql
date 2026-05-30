-- One-time backfill: restore signup usernames for profiles stuck on generated placeholders.
UPDATE public.profiles p
SET username = desired.desired_username
FROM (
  SELECT
    p2.id AS profile_id,
    public.normalize_signup_username(u.raw_user_meta_data->>'username') AS desired_username
  FROM public.profiles p2
  JOIN auth.users u ON u.id = p2.user_id
  WHERE public.is_generated_username(p2.username)
    AND public.normalize_signup_username(u.raw_user_meta_data->>'username') IS NOT NULL
) desired
WHERE p.id = desired.profile_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles taken
    WHERE lower(taken.username) = desired.desired_username
      AND taken.id <> p.id
  );
