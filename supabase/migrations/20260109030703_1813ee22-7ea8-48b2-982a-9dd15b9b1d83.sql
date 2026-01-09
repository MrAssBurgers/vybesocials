-- Create calls table for tracking call state and history
CREATE TABLE public.calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
  status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'accepted', 'declined', 'ended', 'missed', 'busy')),
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create call_signals table for WebRTC signaling
CREATE TABLE public.call_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer', 'answer', 'ice-candidate')),
  signal_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

-- RLS policies for calls - participants can view
CREATE POLICY "Users can view their calls"
  ON public.calls FOR SELECT
  USING (caller_id = public.current_profile_id() OR receiver_id = public.current_profile_id());

-- RLS policies for calls - users can create calls
CREATE POLICY "Users can create calls"
  ON public.calls FOR INSERT
  WITH CHECK (caller_id = public.current_profile_id());

-- RLS policies for calls - participants can update call status
CREATE POLICY "Participants can update calls"
  ON public.calls FOR UPDATE
  USING (caller_id = public.current_profile_id() OR receiver_id = public.current_profile_id());

-- RLS policies for call_signals - participants can view
CREATE POLICY "Users can view their call signals"
  ON public.call_signals FOR SELECT
  USING (from_user_id = public.current_profile_id() OR to_user_id = public.current_profile_id());

-- RLS policies for call_signals - users can create signals
CREATE POLICY "Users can create call signals"
  ON public.call_signals FOR INSERT
  WITH CHECK (from_user_id = public.current_profile_id());

-- Enable realtime for call signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;

-- Create index for faster queries
CREATE INDEX idx_calls_conversation ON public.calls(conversation_id);
CREATE INDEX idx_calls_participants ON public.calls(caller_id, receiver_id);
CREATE INDEX idx_call_signals_call ON public.call_signals(call_id);