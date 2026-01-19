-- Fix ambiguous variable/column name in trigger function used by invite_redemptions
-- This was causing referral confirmations to fail with:
--   column reference "inviter_id" is ambiguous

CREATE OR REPLACE FUNCTION public.check_invite_milestones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_invite_count INTEGER;
  v_inviter_id UUID;
BEGIN
  -- Get the inviter from the invite
  SELECT i.inviter_id INTO v_inviter_id
  FROM public.invites i
  WHERE i.id = NEW.invite_id;

  -- If invite row disappeared (shouldn't), do nothing
  IF v_inviter_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count total accepted invites for this user
  SELECT COUNT(DISTINCT ir.redeemer_id) INTO v_invite_count
  FROM public.invite_redemptions ir
  JOIN public.invites i ON ir.invite_id = i.id
  WHERE i.inviter_id = v_inviter_id;

  -- Award badges based on milestones
  IF v_invite_count >= 1 THEN
    INSERT INTO public.user_badges (user_id, badge_type, badge_name, metadata)
    VALUES (v_inviter_id, 'invite_1', 'First Invite', '{"milestone": 1}'::jsonb)
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;

  IF v_invite_count >= 3 THEN
    INSERT INTO public.user_badges (user_id, badge_type, badge_name, metadata)
    VALUES (v_inviter_id, 'invite_3', 'Rising Star', '{"milestone": 3, "reward": "theme_unlock"}'::jsonb)
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;

  IF v_invite_count >= 10 THEN
    INSERT INTO public.user_badges (user_id, badge_type, badge_name, metadata)
    VALUES (v_inviter_id, 'invite_10', 'Early Builder', '{"milestone": 10}'::jsonb)
    ON CONFLICT (user_id, badge_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;