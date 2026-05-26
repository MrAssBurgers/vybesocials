
-- 1. moderation_feedback table (lightweight "this was wrong" signal)
CREATE TABLE public.moderation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  scan_reason text,
  categories text[],
  feedback_type text NOT NULL CHECK (feedback_type IN ('false_positive','too_strict','other')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.moderation_feedback TO authenticated;
GRANT ALL ON public.moderation_feedback TO service_role;

ALTER TABLE public.moderation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own feedback" ON public.moderation_feedback
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = (SELECT user_id FROM profiles WHERE id = moderation_feedback.user_id));

CREATE POLICY "Users view own feedback" ON public.moderation_feedback
  FOR SELECT TO authenticated
  USING (auth.uid() = (SELECT user_id FROM profiles WHERE id = moderation_feedback.user_id));

CREATE POLICY "Admins view all feedback" ON public.moderation_feedback
  FOR SELECT TO authenticated
  USING (has_role((SELECT id FROM profiles WHERE user_id = auth.uid()), 'admin'::app_role));

-- 2. Extend notifications type CHECK to include moderation_update
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['like'::text, 'comment'::text, 'follow'::text, 'friend_request'::text, 'friend_accepted'::text, 'friend_declined'::text, 'message'::text, 'mention'::text, 'missed_call'::text, 'announcement'::text, 'invite_accepted'::text, 'smart_ping'::text, 'moderation_update'::text]));

-- 3. Trigger: notify user when their appeal is reviewed
CREATE OR REPLACE FUNCTION public.notify_appeal_reviewed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
BEGIN
  IF NEW.status IN ('approved','rejected') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    v_actor := COALESCE(NEW.reviewed_by, NEW.user_id);
    INSERT INTO public.notifications (user_id, actor_id, type, title, body, meta)
    VALUES (
      NEW.user_id,
      v_actor,
      'moderation_update',
      CASE WHEN NEW.status = 'approved' THEN 'Appeal approved' ELSE 'Appeal reviewed' END,
      CASE WHEN NEW.status = 'approved'
        THEN 'A moderator reviewed your appeal and approved your content. You can repost it.'
        ELSE COALESCE(NEW.admin_notes, 'Your appeal was reviewed. The original decision stands.')
      END,
      jsonb_build_object('appeal_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_appeal_reviewed ON public.content_appeals;
CREATE TRIGGER trg_notify_appeal_reviewed
  AFTER UPDATE ON public.content_appeals
  FOR EACH ROW EXECUTE FUNCTION public.notify_appeal_reviewed();
