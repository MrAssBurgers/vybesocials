-- Atomic function to create or get an existing DM conversation
-- This ensures both the conversation and members are created in one transaction
CREATE OR REPLACE FUNCTION public.create_dm_conversation(other_profile_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _my_profile_id uuid;
  _existing_conv_id uuid;
  _new_conv_id uuid;
BEGIN
  -- Get current user's profile id (this also ensures they have a profile)
  _my_profile_id := public.ensure_profile();
  
  -- Validate the other profile exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = other_profile_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Cannot DM yourself
  IF _my_profile_id = other_profile_id THEN
    RAISE EXCEPTION 'Cannot message yourself';
  END IF;
  
  -- Check for existing 1:1 conversation between these users
  SELECT cm1.conversation_id INTO _existing_conv_id
  FROM public.conversation_members cm1
  JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
  JOIN public.conversations c ON c.id = cm1.conversation_id
  WHERE cm1.user_id = _my_profile_id
    AND cm2.user_id = other_profile_id
    AND c.is_group = false
  LIMIT 1;
  
  -- Return existing conversation if found
  IF _existing_conv_id IS NOT NULL THEN
    RETURN _existing_conv_id;
  END IF;
  
  -- Create new conversation
  INSERT INTO public.conversations (is_group, created_by)
  VALUES (false, _my_profile_id)
  RETURNING id INTO _new_conv_id;
  
  -- Add both members
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES 
    (_new_conv_id, _my_profile_id, 'admin'),
    (_new_conv_id, other_profile_id, 'member');
  
  RETURN _new_conv_id;
END;
$$;

-- Ensure only authenticated users can call this
REVOKE ALL ON FUNCTION public.create_dm_conversation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_dm_conversation(uuid) TO authenticated;