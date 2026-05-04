-- 1. Notifications: new optional rich fields
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS deep_link text,
  ADD COLUMN IF NOT EXISTS subtype text,
  ADD COLUMN IF NOT EXISTS meta jsonb DEFAULT '{}'::jsonb;

-- 2. Allow smart_ping type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['like','comment','follow','friend_request','friend_accepted','friend_declined','message','mention','missed_call','announcement','invite_accepted','smart_ping']));

-- 3. Index for dedupe queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_subtype_created
  ON public.notifications(user_id, subtype, created_at DESC)
  WHERE type = 'smart_ping';

-- 4. Notification preferences: smart ping toggles
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS nearby_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS brief_pings_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS friend_activity_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS trending_local_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS smart_ping_radius_miles integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS smart_ping_max_per_day integer DEFAULT 6;

-- 5. Helper RPC: count today's smart pings for a user
CREATE OR REPLACE FUNCTION public.count_smart_pings_today(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.notifications
  WHERE user_id = _user_id
    AND type = 'smart_ping'
    AND created_at >= date_trunc('day', now());
$$;

-- 6. Helper RPC: mute smart pings for N hours (sets dnd_until)
CREATE OR REPLACE FUNCTION public.mute_smart_pings(_hours integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id uuid;
BEGIN
  SELECT id INTO _profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF _profile_id IS NULL THEN RAISE EXCEPTION 'No profile'; END IF;
  UPDATE public.notification_preferences
    SET dnd_until = now() + make_interval(hours => GREATEST(_hours, 0)),
        dnd_enabled = true
    WHERE user_id = _profile_id;
END;
$$;