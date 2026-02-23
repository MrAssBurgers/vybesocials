
-- Allow admins/owners to delete any event
CREATE POLICY "Admins can delete any event"
ON public.events
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid()) OR public.is_owner(auth.uid())
);

-- Allow admins/owners to update any event
CREATE POLICY "Admins can update any event"
ON public.events
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid()) OR public.is_owner(auth.uid())
);

-- Allow admins/owners to delete any RSVP (needed to clean up before deleting events)
CREATE POLICY "Admins can delete any RSVP"
ON public.event_rsvps
FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid()) OR public.is_owner(auth.uid())
);

-- Allow admins/owners to view all events (including private ones)
CREATE POLICY "Admins can view all events"
ON public.events
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) OR public.is_owner(auth.uid())
);
