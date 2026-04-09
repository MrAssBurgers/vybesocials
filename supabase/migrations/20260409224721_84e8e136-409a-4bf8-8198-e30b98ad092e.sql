
-- Create user_locations table for Friend Map
CREATE TABLE public.user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  label TEXT,
  sharing_enabled BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Users can read locations of friends who are sharing
CREATE POLICY "Anyone authenticated can view shared locations"
  ON public.user_locations
  FOR SELECT
  TO authenticated
  USING (sharing_enabled = true);

-- Users can view their own location record
CREATE POLICY "Users can view own location"
  ON public.user_locations
  FOR SELECT
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Users can insert their own location
CREATE POLICY "Users can insert own location"
  ON public.user_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Users can update their own location
CREATE POLICY "Users can update own location"
  ON public.user_locations
  FOR UPDATE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own location
CREATE POLICY "Users can delete own location"
  ON public.user_locations
  FOR DELETE
  TO authenticated
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE TRIGGER update_user_locations_updated_at
  BEFORE UPDATE ON public.user_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast friend lookups
CREATE INDEX idx_user_locations_sharing ON public.user_locations (sharing_enabled) WHERE sharing_enabled = true;
