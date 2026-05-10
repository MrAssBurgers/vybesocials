CREATE TABLE public.app_screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_key text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  feature_tag text,
  raw_url text,
  device_url text,
  marketing_url text,
  width int,
  height int,
  display_order int NOT NULL DEFAULT 0,
  placement text[] NOT NULL DEFAULT ARRAY['features']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "App screenshots are public"
  ON public.app_screenshots FOR SELECT
  USING (true);

CREATE TRIGGER update_app_screenshots_updated_at
  BEFORE UPDATE ON public.app_screenshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-screenshots', 'marketing-screenshots', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Marketing screenshots are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'marketing-screenshots');