-- Create the update_updated_at_column function first
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =============================================
-- MARKETPLACE TABLES
-- =============================================

-- Listings table
CREATE TABLE public.listings (
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Listing favorites
CREATE TABLE public.listing_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, listing_id)
);

-- Seller ratings
CREATE TABLE public.seller_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(seller_id, buyer_id)
);

-- =============================================
-- EVENTS TABLES
-- =============================================

-- Events table
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  location TEXT,
  online_link TEXT,
  event_type TEXT NOT NULL DEFAULT 'in-person',
  cover_image TEXT,
  max_attendees INTEGER,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Event RSVPs
CREATE TABLE public.event_rsvps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'going',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Event comments
CREATE TABLE public.event_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- PUSH NOTIFICATIONS TABLES
-- =============================================

-- Push tokens
CREATE TABLE public.push_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, token)
);

-- Notification preferences
CREATE TABLE public.notification_preferences (
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Listings policies
CREATE POLICY "Anyone can view available listings" ON public.listings
  FOR SELECT USING (status = 'available' OR seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create listings" ON public.listings
  FOR INSERT WITH CHECK (seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own listings" ON public.listings
  FOR UPDATE USING (seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own listings" ON public.listings
  FOR DELETE USING (seller_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Listing favorites policies
CREATE POLICY "Users can view their own favorites" ON public.listing_favorites
  FOR SELECT USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can add favorites" ON public.listing_favorites
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can remove favorites" ON public.listing_favorites
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Seller ratings policies
CREATE POLICY "Anyone can view seller ratings" ON public.seller_ratings
  FOR SELECT USING (true);

CREATE POLICY "Users can rate sellers" ON public.seller_ratings
  FOR INSERT WITH CHECK (buyer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own ratings" ON public.seller_ratings
  FOR UPDATE USING (buyer_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Events policies
CREATE POLICY "Anyone can view public events" ON public.events
  FOR SELECT USING (is_public = true OR host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create events" ON public.events
  FOR INSERT WITH CHECK (host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own events" ON public.events
  FOR UPDATE USING (host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own events" ON public.events
  FOR DELETE USING (host_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Event RSVPs policies
CREATE POLICY "Anyone can view RSVPs for public events" ON public.event_rsvps
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND is_public = true));

CREATE POLICY "Users can RSVP to events" ON public.event_rsvps
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their RSVP" ON public.event_rsvps
  FOR UPDATE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can remove their RSVP" ON public.event_rsvps
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Event comments policies
CREATE POLICY "Anyone can view comments on public events" ON public.event_comments
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.events WHERE id = event_id AND is_public = true));

CREATE POLICY "Users can comment on events" ON public.event_comments
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their own comments" ON public.event_comments
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Push tokens policies
CREATE POLICY "Users can view their own tokens" ON public.push_tokens
  FOR SELECT USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can add their tokens" ON public.push_tokens
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete their tokens" ON public.push_tokens
  FOR DELETE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- Notification preferences policies
CREATE POLICY "Users can view their own preferences" ON public.notification_preferences
  FOR SELECT USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create their preferences" ON public.notification_preferences
  FOR INSERT WITH CHECK (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their preferences" ON public.notification_preferences
  FOR UPDATE USING (user_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

-- =============================================
-- TRIGGERS
-- =============================================

CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_listings_seller ON public.listings(seller_id);
CREATE INDEX idx_listings_category ON public.listings(category);
CREATE INDEX idx_listings_status ON public.listings(status);
CREATE INDEX idx_listings_created ON public.listings(created_at DESC);

CREATE INDEX idx_events_host ON public.events(host_id);
CREATE INDEX idx_events_start ON public.events(start_time);
CREATE INDEX idx_events_type ON public.events(event_type);

CREATE INDEX idx_event_rsvps_event ON public.event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_user ON public.event_rsvps(user_id);