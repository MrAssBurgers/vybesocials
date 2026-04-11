-- conversation_members.user_id stores profiles.id, not auth.uid()
-- We need to map auth.uid() -> profiles.id for membership checks

DROP POLICY IF EXISTS "Members can request safety override" ON public.conversation_safety_overrides;

CREATE POLICY "Members can request safety override"
ON public.conversation_safety_overrides
FOR INSERT TO authenticated
WITH CHECK (
  requested_by = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = conversation_safety_overrides.conversation_id
      AND cm.user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Members can update safety override" ON public.conversation_safety_overrides;

CREATE POLICY "Members can update safety override"
ON public.conversation_safety_overrides
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = conversation_safety_overrides.conversation_id
      AND cm.user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Members can view safety overrides" ON public.conversation_safety_overrides;

CREATE POLICY "Members can view safety overrides"
ON public.conversation_safety_overrides
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM conversation_members cm
    WHERE cm.conversation_id = conversation_safety_overrides.conversation_id
      AND cm.user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Members can respond to safety requests" ON public.conversation_safety_responses;

CREATE POLICY "Members can respond to safety requests"
ON public.conversation_safety_responses
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM conversation_safety_overrides cso
    JOIN conversation_members cm ON cm.conversation_id = cso.conversation_id
    WHERE cso.id = conversation_safety_responses.override_id
      AND cm.user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Members can view safety responses" ON public.conversation_safety_responses;

CREATE POLICY "Members can view safety responses"
ON public.conversation_safety_responses
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM conversation_safety_overrides cso
    JOIN conversation_members cm ON cm.conversation_id = cso.conversation_id
    WHERE cso.id = conversation_safety_responses.override_id
      AND cm.user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
);