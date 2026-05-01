
-- 1. Active boosts table
CREATE TABLE IF NOT EXISTS public.user_active_boosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boost_type TEXT NOT NULL,
  source_item_id TEXT,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  uses_remaining INTEGER,
  consumed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_boosts_user_active
  ON public.user_active_boosts (user_id, boost_type)
  WHERE consumed = false;

ALTER TABLE public.user_active_boosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own boosts"
  ON public.user_active_boosts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- only RPCs (security definer) write to this table
CREATE POLICY "no direct writes"
  ON public.user_active_boosts FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 2. has_active_boost: app-side check
CREATE OR REPLACE FUNCTION public.has_active_boost(p_user_id UUID, p_boost_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_active_boosts
    WHERE user_id = p_user_id
      AND boost_type = p_boost_type
      AND consumed = false
      AND (expires_at IS NULL OR expires_at > now())
      AND (uses_remaining IS NULL OR uses_remaining > 0)
  );
$$;

-- 3. activate_user_boost: redeem an owned item
CREATE OR REPLACE FUNCTION public.activate_user_boost(p_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_owned BOOLEAN;
  v_already BOOLEAN;
  v_boost_type TEXT;
  v_duration INTERVAL;
  v_uses INTEGER;
  v_row public.user_active_boosts;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Map item -> boost spec
  CASE p_item_id
    WHEN 'xp_boost_2x'      THEN v_boost_type := 'xp_2x';            v_duration := interval '1 hour'; v_uses := NULL;
    WHEN 'visibility_boost' THEN v_boost_type := 'visibility';       v_duration := interval '24 hours'; v_uses := 1;
    WHEN 'streak_shield'    THEN v_boost_type := 'streak_shield';    v_duration := interval '30 days'; v_uses := 1;
    WHEN 'token_boost_2x'   THEN v_boost_type := 'tokens_2x';        v_duration := interval '1 hour'; v_uses := NULL;
    WHEN 'roulette_pack'    THEN v_boost_type := 'roulette_spins';   v_duration := NULL;              v_uses := 5;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Item is not activatable');
  END CASE;

  -- Must own the item
  SELECT EXISTS (
    SELECT 1 FROM public.marketplace_purchases
    WHERE user_id = v_user AND item_id = p_item_id
  ) INTO v_owned;

  IF NOT v_owned THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not own this item');
  END IF;

  -- Already active?
  SELECT EXISTS (
    SELECT 1 FROM public.user_active_boosts
    WHERE user_id = v_user
      AND boost_type = v_boost_type
      AND consumed = false
      AND (expires_at IS NULL OR expires_at > now())
      AND (uses_remaining IS NULL OR uses_remaining > 0)
  ) INTO v_already;

  IF v_already THEN
    RETURN jsonb_build_object('success', false, 'error', 'This boost is already active');
  END IF;

  -- Consume the purchase row so it is single-use; user can re-buy to reuse
  DELETE FROM public.marketplace_purchases
  WHERE id = (
    SELECT id FROM public.marketplace_purchases
    WHERE user_id = v_user AND item_id = p_item_id
    ORDER BY purchased_at ASC LIMIT 1
  );

  INSERT INTO public.user_active_boosts (user_id, boost_type, source_item_id, expires_at, uses_remaining)
  VALUES (
    v_user,
    v_boost_type,
    p_item_id,
    CASE WHEN v_duration IS NOT NULL THEN now() + v_duration ELSE NULL END,
    v_uses
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'boost_type', v_row.boost_type,
    'expires_at', v_row.expires_at,
    'uses_remaining', v_row.uses_remaining
  );
END;
$$;

-- 4. consume_streak_shield: called when streak would break
CREATE OR REPLACE FUNCTION public.consume_streak_shield(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM public.user_active_boosts
  WHERE user_id = p_user_id
    AND boost_type = 'streak_shield'
    AND consumed = false
    AND (expires_at IS NULL OR expires_at > now())
    AND (uses_remaining IS NULL OR uses_remaining > 0)
  ORDER BY activated_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.user_active_boosts
  SET consumed = true,
      uses_remaining = COALESCE(uses_remaining, 1) - 1
  WHERE id = v_id;

  RETURN true;
END;
$$;

-- 5. consume_boost_use: generic single-use decrement (visibility_boost, roulette_spins)
CREATE OR REPLACE FUNCTION public.consume_boost_use(p_boost_type TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
  v_uses INTEGER;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT id, uses_remaining INTO v_id, v_uses
  FROM public.user_active_boosts
  WHERE user_id = v_user
    AND boost_type = p_boost_type
    AND consumed = false
    AND (expires_at IS NULL OR expires_at > now())
    AND (uses_remaining IS NULL OR uses_remaining > 0)
  ORDER BY activated_at ASC
  LIMIT 1;

  IF v_id IS NULL THEN RETURN false; END IF;

  UPDATE public.user_active_boosts
  SET uses_remaining = GREATEST(COALESCE(v_uses, 1) - 1, 0),
      consumed = (COALESCE(v_uses, 1) - 1 <= 0)
  WHERE id = v_id;

  RETURN true;
END;
$$;
