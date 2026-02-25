
-- Table for capture/screenshot detection events
CREATE TABLE public.capture_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  viewer_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  media_id TEXT,
  conversation_id UUID,
  type TEXT NOT NULL CHECK (type IN ('screenshot', 'screen_record', 'possible_capture')),
  signals TEXT[] DEFAULT '{}',
  client_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.capture_events ENABLE ROW LEVEL SECURITY;

-- Viewer can insert their own capture events
CREATE POLICY "Users can insert own capture events"
ON public.capture_events FOR INSERT
WITH CHECK (auth.uid() = viewer_id);

-- Sender can view capture events on their media
CREATE POLICY "Senders can view capture events on their media"
ON public.capture_events FOR SELECT
USING (auth.uid() = sender_id);

-- Viewer can view their own capture events
CREATE POLICY "Viewers can view own capture events"
ON public.capture_events FOR SELECT
USING (auth.uid() = viewer_id);

-- Admin can view all
CREATE POLICY "Admins can view all capture events"
ON public.capture_events FOR SELECT
USING (public.is_admin(auth.uid()));

-- Index for quick lookups
CREATE INDEX idx_capture_events_sender ON public.capture_events(sender_id, created_at DESC);
CREATE INDEX idx_capture_events_viewer ON public.capture_events(viewer_id, created_at DESC);
CREATE INDEX idx_capture_events_conversation ON public.capture_events(conversation_id, created_at DESC);

-- Enable realtime for sender notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.capture_events;
