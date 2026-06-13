-- Bootstrap for Supabase project hprmicwhlaaqfgshucec
-- Run once in SQL Editor OR: npx supabase db query --linked -f supabase/manual/BOOTSTRAP_hprmicwhlaaqfgshucec.sql
-- Then: npx supabase migration repair --status applied 20260109190634
-- Then: npx supabase db push --yes

-- =============================================================================
-- 1) Patch profiles (skeleton DB missing columns from early migrations)
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS link_url TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sensitivity_preference TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS coins_balance INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

UPDATE public.profiles SET bio = '' WHERE bio IS NULL;

-- =============================================================================
-- 2) Patch events (table exists but may lack app columns)
-- =============================================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS host_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS online_link TEXT,
  ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'in-person',
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS max_attendees INTEGER,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE public.events SET is_public = true WHERE is_public IS NULL;
UPDATE public.events SET event_type = 'in-person' WHERE event_type IS NULL;

-- =============================================================================
-- 3) Shared functions (migration 20260109190634 + early app migrations)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- =============================================================================
-- 4) Migration 20260109190634 body (SKIP CREATE TABLE events — already exists)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL(12, 2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'used',
  location TEXT,
  images TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'available',
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.listing_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS public.seller_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(seller_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.event_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  likes_enabled BOOLEAN DEFAULT true,
  comments_enabled BOOLEAN DEFAULT true,
  follows_enabled BOOLEAN DEFAULT true,
  mentions_enabled BOOLEAN DEFAULT true,
  dms_enabled BOOLEAN DEFAULT true,
  marketplace_enabled BOOLEAN DEFAULT true,
  events_enabled BOOLEAN DEFAULT true,
  system_enabled BOOLEAN DEFAULT true,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Listings policies
DROP POLICY IF EXISTS "Anyone can view available listings" ON public.listings;
CREATE POLICY "Anyone can view available listings" ON public.listings
  FOR SELECT USING (status = 'available' OR seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create listings" ON public.listings;
CREATE POLICY "Users can create listings" ON public.listings
  FOR INSERT WITH CHECK (seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own listings" ON public.listings;
CREATE POLICY "Users can update their own listings" ON public.listings
  FOR UPDATE USING (seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own listings" ON public.listings;
CREATE POLICY "Users can delete their own listings" ON public.listings
  FOR DELETE USING (seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Listing favorites policies
DROP POLICY IF EXISTS "Users can view their own favorites" ON public.listing_favorites;
CREATE POLICY "Users can view their own favorites" ON public.listing_favorites
  FOR SELECT USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can add favorites" ON public.listing_favorites;
CREATE POLICY "Users can add favorites" ON public.listing_favorites
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can remove favorites" ON public.listing_favorites;
CREATE POLICY "Users can remove favorites" ON public.listing_favorites
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Seller ratings policies
DROP POLICY IF EXISTS "Anyone can view seller ratings" ON public.seller_ratings;
CREATE POLICY "Anyone can view seller ratings" ON public.seller_ratings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can rate sellers" ON public.seller_ratings;
CREATE POLICY "Users can rate sellers" ON public.seller_ratings
  FOR INSERT WITH CHECK (buyer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own ratings" ON public.seller_ratings;
CREATE POLICY "Users can update their own ratings" ON public.seller_ratings
  FOR UPDATE USING (buyer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Events policies
DROP POLICY IF EXISTS "Anyone can view public events" ON public.events;
CREATE POLICY "Anyone can view public events" ON public.events
  FOR SELECT USING (is_public = true OR host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create events" ON public.events;
CREATE POLICY "Users can create events" ON public.events
  FOR INSERT WITH CHECK (host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their own events" ON public.events;
CREATE POLICY "Users can update their own events" ON public.events
  FOR UPDATE USING (host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own events" ON public.events;
CREATE POLICY "Users can delete their own events" ON public.events
  FOR DELETE USING (host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Event RSVPs policies
DROP POLICY IF EXISTS "Anyone can view RSVPs for public events" ON public.event_rsvps;
CREATE POLICY "Anyone can view RSVPs for public events" ON public.event_rsvps
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND is_public = true));

DROP POLICY IF EXISTS "Users can RSVP to events" ON public.event_rsvps;
CREATE POLICY "Users can RSVP to events" ON public.event_rsvps
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their RSVP" ON public.event_rsvps;
CREATE POLICY "Users can update their RSVP" ON public.event_rsvps
  FOR UPDATE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can remove their RSVP" ON public.event_rsvps;
CREATE POLICY "Users can remove their RSVP" ON public.event_rsvps
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Event comments policies
DROP POLICY IF EXISTS "Anyone can view comments on public events" ON public.event_comments;
CREATE POLICY "Anyone can view comments on public events" ON public.event_comments
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND is_public = true));

DROP POLICY IF EXISTS "Users can comment on events" ON public.event_comments;
CREATE POLICY "Users can comment on events" ON public.event_comments
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.event_comments;
CREATE POLICY "Users can delete their own comments" ON public.event_comments
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Push tokens policies
DROP POLICY IF EXISTS "Users can view their own tokens" ON public.push_tokens;
CREATE POLICY "Users can view their own tokens" ON public.push_tokens
  FOR SELECT USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can add their tokens" ON public.push_tokens;
CREATE POLICY "Users can add their tokens" ON public.push_tokens
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete their tokens" ON public.push_tokens;
CREATE POLICY "Users can delete their tokens" ON public.push_tokens
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Notification preferences policies
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can view their own preferences" ON public.notification_preferences
  FOR SELECT USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can create their preferences" ON public.notification_preferences;
CREATE POLICY "Users can create their preferences" ON public.notification_preferences
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can update their preferences" ON public.notification_preferences;
CREATE POLICY "Users can update their preferences" ON public.notification_preferences
  FOR UPDATE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Triggers
DROP TRIGGER IF EXISTS update_listings_updated_at ON public.listings;
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_events_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_listings_seller ON public.listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON public.listings(category);
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_created ON public.listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_host ON public.events(host_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON public.events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.events(event_type);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON public.event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user ON public.event_rsvps(user_id);
