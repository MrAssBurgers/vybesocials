CREATE OR REPLACE FUNCTION public.trg_vybe_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  PERFORM public.award_vybe_points(NEW.sender_id, 'dm_send', NULL, NEW.id);
  FOR recipient IN
    SELECT cm.user_id FROM public.conversation_members cm
      WHERE cm.conversation_id = NEW.conversation_id
        AND cm.user_id <> NEW.sender_id
  LOOP
    PERFORM public.award_vybe_points(recipient, 'dm_receive', NULL, NEW.id);
  END LOOP;
  RETURN NEW;
END $$;