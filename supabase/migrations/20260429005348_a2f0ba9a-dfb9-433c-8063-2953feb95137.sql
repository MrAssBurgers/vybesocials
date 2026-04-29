CREATE INDEX IF NOT EXISTS idx_messages_conversation_visible_created
ON public.messages (conversation_id, created_at)
WHERE is_deleted IS NOT TRUE;

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment_id
ON public.comment_likes (comment_id);

CREATE OR REPLACE FUNCTION public.can_access_conversation(_conversation_id uuid, _profile_id uuid DEFAULT public.current_profile_id())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _conversation_id IS NOT NULL
    AND _profile_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = _conversation_id
        AND cm.user_id = _profile_id
    )
$$;

CREATE OR REPLACE FUNCTION public.can_access_message(_conversation_id uuid, _deleted_for_users uuid[] DEFAULT NULL::uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_conversation(_conversation_id, public.current_profile_id())
    AND NOT (COALESCE(_deleted_for_users, ARRAY[]::uuid[]) @> ARRAY[public.current_profile_id()])
$$;

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
ON public.messages
FOR SELECT
TO authenticated
USING (
  is_deleted IS NOT TRUE
  AND public.can_access_message(conversation_id, deleted_for_users)
);

DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
CREATE POLICY "Users can send messages to their conversations"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = public.current_profile_id()
  AND public.can_access_conversation(conversation_id, sender_id)
);

DROP POLICY IF EXISTS "Members can delete messages for themselves" ON public.messages;
CREATE POLICY "Members can delete messages for themselves"
ON public.messages
FOR UPDATE
TO authenticated
USING (public.can_access_conversation(conversation_id, public.current_profile_id()))
WITH CHECK (public.can_access_conversation(conversation_id, public.current_profile_id()));

DROP POLICY IF EXISTS "Members can view conversation members" ON public.conversation_members;
CREATE POLICY "Members can view conversation members"
ON public.conversation_members
FOR SELECT
TO authenticated
USING (
  user_id = public.current_profile_id()
  OR public.can_access_conversation(conversation_id, public.current_profile_id())
);

DROP POLICY IF EXISTS "Authenticated users can like comments" ON public.comment_likes;
CREATE POLICY "Authenticated users can like comments"
ON public.comment_likes
FOR INSERT
TO authenticated
WITH CHECK (user_id = public.current_profile_id());

DROP POLICY IF EXISTS "Users can unlike their own likes" ON public.comment_likes;
CREATE POLICY "Users can unlike their own likes"
ON public.comment_likes
FOR DELETE
TO authenticated
USING (user_id = public.current_profile_id());

CREATE OR REPLACE FUNCTION public.get_user_primary_badge(p_user_id uuid)
RETURNS TABLE(id uuid, name text, icon text, category text, priority integer, gradient_from text, gradient_to text, gradient_via text, effect text, is_animated boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid;
  v_owner_auth_id uuid;
  v_wife_auth_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  v_auth_id := public.get_auth_id_for_profile(p_user_id);
  IF v_auth_id IS NULL THEN
    RETURN;
  END IF;

  v_owner_auth_id := public.get_owner_auth_id();
  v_wife_auth_id := public.get_owner_wife_auth_id();

  IF v_owner_auth_id IS NOT NULL AND v_auth_id = v_owner_auth_id THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::text, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, COALESCE(b.is_animated, false)
    FROM public.badges b
    WHERE b.name = 'Owner' AND b.is_active IS TRUE
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF v_wife_auth_id IS NOT NULL AND v_auth_id = v_wife_auth_id THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::text, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, COALESCE(b.is_animated, false)
    FROM public.badges b
    WHERE b.name = 'Owner''s Wife' AND b.is_active IS TRUE
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF public.has_role(v_auth_id, 'admin'::public.app_role) THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::text, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, COALESCE(b.is_animated, false)
    FROM public.badges b
    WHERE b.name = 'Admin' AND b.is_active IS TRUE
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  IF public.has_role(v_auth_id, 'moderator'::public.app_role) THEN
    RETURN QUERY
    SELECT b.id, b.name, b.icon, b.category::text, b.priority,
           b.gradient_from, b.gradient_to, b.gradient_via, b.effect, COALESCE(b.is_animated, false)
    FROM public.badges b
    WHERE b.name = 'Moderator' AND b.is_active IS TRUE
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  SELECT b.id, b.name, b.icon, b.category::text, b.priority,
         b.gradient_from, b.gradient_to, b.gradient_via, b.effect, COALESCE(b.is_animated, false)
  FROM public.user_badges ub
  JOIN public.badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_auth_id
    AND ub.is_primary IS TRUE
    AND b.is_active IS TRUE
    AND (ub.expires_at IS NULL OR ub.expires_at > now())
  ORDER BY b.priority ASC
  LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT b.id, b.name, b.icon, b.category::text, b.priority,
         b.gradient_from, b.gradient_to, b.gradient_via, b.effect, COALESCE(b.is_animated, false)
  FROM public.user_badges ub
  JOIN public.badges b ON b.id = ub.badge_id
  WHERE ub.user_id = v_auth_id
    AND b.is_active IS TRUE
    AND (ub.expires_at IS NULL OR ub.expires_at > now())
  ORDER BY b.priority ASC
  LIMIT 1;
END;
$$;