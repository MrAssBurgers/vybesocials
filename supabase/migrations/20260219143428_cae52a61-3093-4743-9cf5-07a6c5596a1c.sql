
-- Fix check_invite_milestones: use ON CONFLICT (user_id, badge_id) instead of (user_id, badge_type)
-- The user_badges table has a unique constraint on (user_id, badge_id), NOT (user_id, badge_type)
CREATE OR REPLACE FUNCTION public.check_invite_milestones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_count INTEGER;
  v_inviter_id UUID;
  v_badge_id UUID;
BEGIN
  -- Get the inviter from the invite
  SELECT i.inviter_id INTO v_inviter_id
  FROM public.invites i
  WHERE i.id = NEW.invite_id;

  IF v_inviter_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count total accepted invites for this user
  SELECT COUNT(DISTINCT ir.redeemer_id) INTO v_invite_count
  FROM public.invite_redemptions ir
  JOIN public.invites i ON ir.invite_id = i.id
  WHERE i.inviter_id = v_inviter_id;

  -- Award badges based on milestones using ON CONFLICT (user_id, badge_id)
  IF v_invite_count >= 1 THEN
    SELECT id INTO v_badge_id FROM badges WHERE name = 'First Invite' LIMIT 1;
    IF v_badge_id IS NOT NULL THEN
      INSERT INTO public.user_badges (user_id, badge_id, badge_type, badge_name, metadata)
      VALUES (v_inviter_id, v_badge_id, 'invite_1', 'First Invite', '{"milestone": 1}'::jsonb)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
  END IF;

  IF v_invite_count >= 3 THEN
    SELECT id INTO v_badge_id FROM badges WHERE name = 'Rising Star' LIMIT 1;
    IF v_badge_id IS NOT NULL THEN
      INSERT INTO public.user_badges (user_id, badge_id, badge_type, badge_name, metadata)
      VALUES (v_inviter_id, v_badge_id, 'invite_3', 'Rising Star', '{"milestone": 3, "reward": "theme_unlock"}'::jsonb)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
  END IF;

  IF v_invite_count >= 10 THEN
    SELECT id INTO v_badge_id FROM badges WHERE name = 'Early Builder' LIMIT 1;
    IF v_badge_id IS NOT NULL THEN
      INSERT INTO public.user_badges (user_id, badge_id, badge_type, badge_name, metadata)
      VALUES (v_inviter_id, v_badge_id, 'invite_10', 'Early Builder', '{"milestone": 10}'::jsonb)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Fix auto_grant_founding_badge: use ON CONFLICT (user_id, badge_id) instead of (user_id, badge_type)
CREATE OR REPLACE FUNCTION public.auto_grant_founding_badge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config JSONB;
  v_badge_id UUID;
  v_max_slots INT;
  v_current_count INT;
  v_is_active BOOLEAN;
  v_badge_name TEXT;
BEGIN
  SELECT value INTO v_config FROM growth_config WHERE key = 'founding_program';
  IF v_config IS NULL THEN RETURN NEW; END IF;
  
  v_badge_id := (v_config->>'badge_id')::UUID;
  v_max_slots := (v_config->>'max_slots')::INT;
  v_is_active := (v_config->>'is_active')::BOOLEAN;
  
  IF NOT v_is_active THEN RETURN NEW; END IF;
  
  SELECT name INTO v_badge_name FROM badges WHERE id = v_badge_id;
  SELECT COUNT(*) INTO v_current_count FROM user_badges WHERE badge_id = v_badge_id;
  
  IF v_current_count < v_max_slots THEN
    INSERT INTO user_badges (user_id, badge_id, badge_type, badge_name)
    VALUES (NEW.user_id, v_badge_id, 'special', COALESCE(v_badge_name, 'Founding Member'))
    ON CONFLICT (user_id, badge_id) DO NOTHING;
  END IF;
  
  IF v_current_count + 1 >= v_max_slots THEN
    UPDATE growth_config SET value = value || '{"is_active": false}'::jsonb, updated_at = now()
    WHERE key = 'founding_program';
  END IF;
  
  RETURN NEW;
END;
$$;
