
CREATE OR REPLACE FUNCTION public.clear_conversation_messages(p_conversation_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_member boolean;
  v_updated int;
BEGIN
  -- Verify the user is a member of this conversation
  SELECT EXISTS(
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = p_user_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a member of this conversation');
  END IF;

  -- Soft-delete ALL messages in the conversation (bypass RLS via SECURITY DEFINER)
  UPDATE messages
  SET is_deleted = true, deleted_at = now(), content = null, media_url = null
  WHERE conversation_id = p_conversation_id
    AND (is_deleted IS NULL OR is_deleted = false);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'cleared', v_updated);
END;
$$;
