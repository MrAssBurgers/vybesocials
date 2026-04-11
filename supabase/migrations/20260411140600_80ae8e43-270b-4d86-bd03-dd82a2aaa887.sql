
-- Table: conversation_safety_overrides
-- Tracks requests to disable AI safety filters per conversation
CREATE TABLE public.conversation_safety_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- Validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_safety_override_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'accepted', 'declined', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_safety_override_status
  BEFORE INSERT OR UPDATE ON public.conversation_safety_overrides
  FOR EACH ROW EXECUTE FUNCTION public.validate_safety_override_status();

-- Only one pending/accepted override per conversation
CREATE UNIQUE INDEX idx_conversation_safety_active
  ON public.conversation_safety_overrides(conversation_id)
  WHERE status IN ('pending', 'accepted');

ALTER TABLE public.conversation_safety_overrides ENABLE ROW LEVEL SECURITY;

-- RLS: conversation members can view
CREATE POLICY "Members can view safety overrides"
  ON public.conversation_safety_overrides FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_safety_overrides.conversation_id
      AND cm.user_id = auth.uid()
    )
  );

-- RLS: authenticated users can insert for their own conversations
CREATE POLICY "Members can request safety override"
  ON public.conversation_safety_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_safety_overrides.conversation_id
      AND cm.user_id = auth.uid()
    )
  );

-- RLS: requester can cancel, members can update status
CREATE POLICY "Members can update safety override"
  ON public.conversation_safety_overrides FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_safety_overrides.conversation_id
      AND cm.user_id = auth.uid()
    )
  );

-- Table: conversation_safety_responses (for group chats)
CREATE TABLE public.conversation_safety_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  override_id UUID NOT NULL REFERENCES public.conversation_safety_overrides(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(override_id, user_id)
);

CREATE OR REPLACE FUNCTION public.validate_safety_response()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.response NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'Invalid response: %', NEW.response;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_validate_safety_response
  BEFORE INSERT OR UPDATE ON public.conversation_safety_responses
  FOR EACH ROW EXECUTE FUNCTION public.validate_safety_response();

ALTER TABLE public.conversation_safety_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view safety responses"
  ON public.conversation_safety_responses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_safety_overrides cso
      JOIN public.conversation_members cm ON cm.conversation_id = cso.conversation_id
      WHERE cso.id = conversation_safety_responses.override_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can respond to safety requests"
  ON public.conversation_safety_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_safety_overrides cso
      JOIN public.conversation_members cm ON cm.conversation_id = cso.conversation_id
      WHERE cso.id = conversation_safety_responses.override_id
      AND cm.user_id = auth.uid()
    )
  );

-- Add content_rating to user_stickers
ALTER TABLE public.user_stickers ADD COLUMN IF NOT EXISTS content_rating TEXT NOT NULL DEFAULT 'safe';

-- Enable realtime for safety overrides so users get instant popups
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_safety_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_safety_responses;
