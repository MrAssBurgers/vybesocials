
-- Stripe configuration table (non-sensitive settings only)
CREATE TABLE public.stripe_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_enabled boolean NOT NULL DEFAULT false,
  stripe_mode text NOT NULL DEFAULT 'test' CHECK (stripe_mode IN ('test', 'live')),
  stripe_publishable_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one row should ever exist (singleton config)
CREATE UNIQUE INDEX stripe_config_singleton ON public.stripe_config ((true));

-- Enable RLS
ALTER TABLE public.stripe_config ENABLE ROW LEVEL SECURITY;

-- Only admins can read stripe config
CREATE POLICY "Admins can view stripe config"
  ON public.stripe_config FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Only admins can insert stripe config
CREATE POLICY "Admins can insert stripe config"
  ON public.stripe_config FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Only admins can update stripe config
CREATE POLICY "Admins can update stripe config"
  ON public.stripe_config FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Backend functions need to read config (service role bypasses RLS anyway)
-- But we also need a public read function for checking if stripe is enabled
CREATE OR REPLACE FUNCTION public.is_stripe_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT stripe_enabled FROM public.stripe_config LIMIT 1),
    false
  )
$$;

-- Trigger for updated_at
CREATE TRIGGER update_stripe_config_updated_at
  BEFORE UPDATE ON public.stripe_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default row
INSERT INTO public.stripe_config (stripe_enabled, stripe_mode) VALUES (false, 'test');
