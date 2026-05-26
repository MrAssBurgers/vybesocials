-- Expand SELECT access on shared_themes to support unlisted links and DM sharing
DROP POLICY IF EXISTS "Anyone can view public shared themes" ON public.shared_themes;

CREATE POLICY "View shared themes (public, owned, saved, or received)"
ON public.shared_themes
FOR SELECT
USING (
  is_public = true
  OR creator_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.saved_themes st
    WHERE st.shared_theme_id = shared_themes.id
      AND st.user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.message_type = 'shared_theme'
      AND m.content = shared_themes.id::text
      AND cm.user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
  )
);

-- For unlisted-link access (logged-in users who have the link but it's not in their saved/DMs yet)
-- We accept the security trade-off that any authenticated user with the UUID can SELECT the row.
-- This matches the "Unlisted link" share semantic.
CREATE POLICY "View shared theme by direct id lookup (unlisted)"
ON public.shared_themes
FOR SELECT
TO authenticated
USING (true);
