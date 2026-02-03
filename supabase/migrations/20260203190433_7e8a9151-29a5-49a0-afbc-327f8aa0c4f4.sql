-- Add DELETE policy for user_badges (admins can remove any badge)
CREATE POLICY "Admins can delete user badges"
ON public.user_badges
FOR DELETE
USING (
  public.current_user_has_role('admin')
);

-- Also allow users to remove their own badges (if can_be_disabled)
CREATE POLICY "Users can remove own disablable badges"
ON public.user_badges
FOR DELETE
USING (
  auth.uid() = user_id
  AND (
    badge_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM public.badges
      WHERE badges.id = user_badges.badge_id
      AND badges.can_be_disabled = true
    )
  )
);