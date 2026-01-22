-- Create friend_drops table for realtime sync between devices during QR add
CREATE TABLE public.friend_drops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scanned', 'confirmed', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.friend_drops ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own drops (either as sender or receiver)
CREATE POLICY "Users can view own drops" ON public.friend_drops
  FOR SELECT USING (
    from_user_id = public.current_profile_id() OR 
    to_user_id = public.current_profile_id()
  );

-- Policy: Users can create drops for themselves
CREATE POLICY "Users can create own drops" ON public.friend_drops
  FOR INSERT WITH CHECK (from_user_id = public.current_profile_id());

-- Policy: Users can update drops they're involved in
CREATE POLICY "Users can update own drops" ON public.friend_drops
  FOR UPDATE USING (
    from_user_id = public.current_profile_id() OR 
    to_user_id = public.current_profile_id()
  );

-- Policy: Users can delete their own drops
CREATE POLICY "Users can delete own drops" ON public.friend_drops
  FOR DELETE USING (from_user_id = public.current_profile_id());

-- Index for fast lookups
CREATE INDEX idx_friend_drops_from_user ON public.friend_drops(from_user_id);
CREATE INDEX idx_friend_drops_to_user ON public.friend_drops(to_user_id);
CREATE INDEX idx_friend_drops_status ON public.friend_drops(status) WHERE status IN ('pending', 'scanned', 'confirmed');

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_drops;

-- Auto-cleanup old pending drops (older than 5 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_old_friend_drops()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.friend_drops 
  WHERE status = 'pending' 
    AND created_at < now() - INTERVAL '5 minutes';
END;
$$;