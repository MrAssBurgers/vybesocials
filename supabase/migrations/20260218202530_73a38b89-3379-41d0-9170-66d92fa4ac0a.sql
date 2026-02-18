
-- Atomic referral confirmation function
-- Handles: validation, idempotency, redemption, rewards, friendship, notification
-- All in ONE transaction. Returns structured JSONB result.
CREATE OR REPLACE FUNCTION public.confirm_referral_atomic(
  p_inviter_profile_id UUID,
  p_inviter_user_id UUID,
  p_redeemer_auth_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_redeemer_profile RECORD;
  v_invite_id UUID;
  v_use_count INT;
  v_already_confirmed BOOLEAN := FALSE;
  v_rewards_granted BOOLEAN := FALSE;
  v_new_use_count INT;
BEGIN
  -- ===== 1. Get redeemer profile =====
  SELECT id, username, referral_inviter_id
  INTO v_redeemer_profile
  FROM profiles
  WHERE user_id = p_redeemer_auth_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PROFILE_NOT_FOUND',
      'error_message', 'Your profile has not been created yet. Please try again in a moment.'
    );
  END IF;

  -- ===== 2. Self-referral guard =====
  IF v_redeemer_profile.id = p_inviter_profile_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'SELF_REFERRAL',
      'error_message', 'You cannot refer yourself.'
    );
  END IF;

  -- ===== 3. Idempotency: already confirmed? =====
  IF v_redeemer_profile.referral_inviter_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'inviter_profile_id', v_redeemer_profile.referral_inviter_id,
      'rewards_granted', false
    );
  END IF;

  -- Also check invite_redemptions table
  IF EXISTS (SELECT 1 FROM invite_redemptions WHERE redeemer_id = p_redeemer_auth_id) THEN
    -- Backfill referral_inviter_id if missing
    UPDATE profiles SET referral_inviter_id = p_inviter_profile_id
    WHERE id = v_redeemer_profile.id AND referral_inviter_id IS NULL;

    RETURN jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'inviter_profile_id', p_inviter_profile_id,
      'rewards_granted', false
    );
  END IF;

  -- ===== 4. Find or create invite record =====
  SELECT id, COALESCE(use_count, 0) INTO v_invite_id, v_use_count
  FROM invites
  WHERE inviter_id = p_inviter_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite_id IS NULL THEN
    INSERT INTO invites (inviter_id, invite_code, use_count)
    VALUES (p_inviter_user_id, upper(substr(md5(random()::text), 1, 8)), 0)
    RETURNING id, use_count INTO v_invite_id, v_use_count;
  END IF;

  -- ===== 5. Create redemption =====
  INSERT INTO invite_redemptions (invite_id, redeemer_id)
  VALUES (v_invite_id, p_redeemer_auth_id);

  -- ===== 6. Mark referral on profile =====
  UPDATE profiles
  SET referral_inviter_id = p_inviter_profile_id
  WHERE id = v_redeemer_profile.id;

  -- ===== 7. Increment use_count =====
  v_new_use_count := v_use_count + 1;
  UPDATE invites SET use_count = v_new_use_count WHERE id = v_invite_id;

  -- ===== 8. Grant XP (best-effort within transaction) =====
  BEGIN
    PERFORM add_user_xp(p_inviter_profile_id, 500);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'XP grant to inviter failed: %', SQLERRM;
  END;

  BEGIN
    PERFORM add_user_xp(v_redeemer_profile.id, 250);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'XP grant to redeemer failed: %', SQLERRM;
  END;

  v_rewards_granted := TRUE;

  -- ===== 9. Badges for milestones =====
  DECLARE
    v_badge_id UUID;
  BEGIN
    IF v_new_use_count >= 1 THEN
      SELECT id INTO v_badge_id FROM badges WHERE name = 'First Invite' LIMIT 1;
      IF v_badge_id IS NOT NULL THEN
        INSERT INTO user_badges (user_id, badge_id, badge_type, badge_name)
        VALUES (p_inviter_user_id, v_badge_id, 'invite_1', 'First Invite')
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;
    END IF;
    IF v_new_use_count >= 3 THEN
      SELECT id INTO v_badge_id FROM badges WHERE name = 'Rising Star' LIMIT 1;
      IF v_badge_id IS NOT NULL THEN
        INSERT INTO user_badges (user_id, badge_id, badge_type, badge_name)
        VALUES (p_inviter_user_id, v_badge_id, 'invite_3', 'Rising Star')
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;
    END IF;
    IF v_new_use_count >= 10 THEN
      SELECT id INTO v_badge_id FROM badges WHERE name = 'Early Builder' LIMIT 1;
      IF v_badge_id IS NOT NULL THEN
        INSERT INTO user_badges (user_id, badge_id, badge_type, badge_name)
        VALUES (p_inviter_user_id, v_badge_id, 'invite_10', 'Early Builder')
        ON CONFLICT (user_id, badge_id) DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Badge grant failed: %', SQLERRM;
  END;

  -- ===== 10. Friendship (auto-accept) =====
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM friend_requests
      WHERE (sender_id = v_redeemer_profile.id AND receiver_id = p_inviter_profile_id)
         OR (sender_id = p_inviter_profile_id AND receiver_id = v_redeemer_profile.id)
    ) THEN
      INSERT INTO friend_requests (sender_id, receiver_id, status)
      VALUES (v_redeemer_profile.id, p_inviter_profile_id, 'accepted');
    ELSE
      UPDATE friend_requests SET status = 'accepted'
      WHERE ((sender_id = v_redeemer_profile.id AND receiver_id = p_inviter_profile_id)
          OR (sender_id = p_inviter_profile_id AND receiver_id = v_redeemer_profile.id))
        AND status = 'pending';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Friendship creation failed: %', SQLERRM;
  END;

  -- ===== 11. Notification =====
  BEGIN
    INSERT INTO notifications (user_id, actor_id, type)
    VALUES (p_inviter_profile_id, v_redeemer_profile.id, 'invite_accepted');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Notification insert failed: %', SQLERRM;
  END;

  -- ===== 12. Return success =====
  RETURN jsonb_build_object(
    'success', true,
    'already_confirmed', false,
    'inviter_profile_id', p_inviter_profile_id,
    'redeemer_profile_id', v_redeemer_profile.id,
    'rewards_granted', v_rewards_granted,
    'new_use_count', v_new_use_count
  );
END;
$$;
