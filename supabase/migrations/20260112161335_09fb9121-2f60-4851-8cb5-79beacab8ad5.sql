-- Atomic group chat creation (used by backend function)

CREATE OR REPLACE FUNCTION public.create_group_chat(
  p_name text,
  p_creator_profile_id uuid,
  p_member_profile_ids uuid[]
)
RETURNS TABLE(group_id uuid, group_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean_name text;
  _members uuid[];
  _conv_id uuid;
BEGIN
  _clean_name := btrim(coalesce(p_name, ''));
  IF _clean_name = '' THEN
    RAISE EXCEPTION 'Group name required';
  END IF;

  -- Normalize member list: dedupe, remove nulls, remove creator
  SELECT array_agg(DISTINCT m)
  INTO _members
  FROM unnest(coalesce(p_member_profile_ids, ARRAY[]::uuid[])) AS m
  WHERE m IS NOT NULL
    AND m <> p_creator_profile_id;

  IF _members IS NULL OR array_length(_members, 1) < 2 THEN
    RAISE EXCEPTION 'At least 2 members required';
  END IF;

  -- Create group conversation (maps to "group_chat" in the app)
  INSERT INTO public.conversations (name, is_group, created_by)
  VALUES (_clean_name, true, p_creator_profile_id)
  RETURNING id INTO _conv_id;

  -- Creator membership (conversation_members + group_members)
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (_conv_id, p_creator_profile_id, 'owner');

  INSERT INTO public.group_members (conversation_id, user_id, role)
  VALUES (_conv_id, p_creator_profile_id, 'owner');

  -- Other members
  INSERT INTO public.group_members (conversation_id, user_id, role, invited_by)
  SELECT _conv_id, m, 'member', p_creator_profile_id
  FROM unnest(_members) AS m;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  SELECT _conv_id, m, 'member'
  FROM unnest(_members) AS m;

  group_id := _conv_id;
  group_name := _clean_name;
  RETURN NEXT;
END;
$$;

-- Lock down direct access: only backend (service role) can execute
REVOKE ALL ON FUNCTION public.create_group_chat(text, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_group_chat(text, uuid, uuid[]) TO service_role;
