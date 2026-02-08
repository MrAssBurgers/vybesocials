-- =============================================
-- GLOBAL LIVE EVENTS + SPONSORS + COLLABS + SAFETY
-- =============================================

-- Sponsor profiles (verified sponsors who can create sponsored content)
CREATE TABLE IF NOT EXISTS public.sponsor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_logo TEXT,
  website_url TEXT,
  description TEXT,
  is_verified BOOLEAN DEFAULT false,
  verification_date TIMESTAMPTZ,
  contact_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Add sponsor/global fields to events table
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES public.sponsor_profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public' CHECK (visibility IN ('global', 'community', 'creator', 'public')),
ADD COLUMN IF NOT EXISTS live_url TEXT,
ADD COLUMN IF NOT EXISTS replay_url TEXT,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Collab posts (dual attribution)
CREATE TABLE IF NOT EXISTS public.collab_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'collaborator', -- 'primary', 'collaborator', 'sponsor'
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, collaborator_id)
);

-- Sponsored content analytics
CREATE TABLE IF NOT EXISTS public.sponsor_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id UUID NOT NULL REFERENCES public.sponsor_profiles(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'post')),
  content_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'click', 'rsvp', 'join', 'share')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User safety settings (extends profiles)
CREATE TABLE IF NOT EXISTS public.user_safety_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content_filter_level TEXT DEFAULT 'moderate' CHECK (content_filter_level IN ('protected', 'moderate', 'minimal')),
  dm_filter TEXT DEFAULT 'friends_only' CHECK (dm_filter IN ('everyone', 'friends_only', 'nobody')),
  message_requests_enabled BOOLEAN DEFAULT true,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  muted_keywords TEXT[] DEFAULT '{}',
  show_global_events BOOLEAN DEFAULT true,
  take_a_break_reminder BOOLEAN DEFAULT true,
  break_reminder_interval_hours INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Message requests (for non-friends)
CREATE TABLE IF NOT EXISTS public.message_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_preview TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(sender_id, receiver_id)
);

-- How U Doin hub content
CREATE TABLE IF NOT EXISTS public.hub_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pillar TEXT NOT NULL CHECK (pillar IN ('fun', 'connection', 'discovery', 'direction')),
  title TEXT NOT NULL,
  description TEXT,
  content_type TEXT NOT NULL CHECK (content_type IN ('resource', 'challenge', 'event', 'tip')),
  content_url TEXT,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weekly check-in prompts
CREATE TABLE IF NOT EXISTS public.checkin_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_text TEXT NOT NULL,
  pillar TEXT CHECK (pillar IN ('fun', 'connection', 'discovery', 'direction')),
  is_active BOOLEAN DEFAULT true,
  week_number INTEGER,
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User check-in responses
CREATE TABLE IF NOT EXISTS public.user_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.checkin_prompts(id) ON DELETE SET NULL,
  response TEXT,
  mood_rating INTEGER CHECK (mood_rating >= 1 AND mood_rating <= 5),
  is_private BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.sponsor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collab_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_safety_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hub_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_checkins ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Sponsor profiles: viewable by all, editable by owner
CREATE POLICY "Sponsor profiles are viewable by all" ON public.sponsor_profiles FOR SELECT USING (true);
CREATE POLICY "Users can manage their sponsor profile" ON public.sponsor_profiles FOR ALL USING (user_id = current_profile_id());

-- Collab posts: viewable by all, manageable by participants
CREATE POLICY "Collab posts are viewable by all" ON public.collab_posts FOR SELECT USING (true);
CREATE POLICY "Collaborators can manage their collab" ON public.collab_posts FOR ALL USING (collaborator_id = current_profile_id());

-- Sponsor analytics: only sponsors can view their own
CREATE POLICY "Sponsors can view their analytics" ON public.sponsor_analytics FOR SELECT 
  USING (sponsor_id IN (SELECT id FROM sponsor_profiles WHERE user_id = current_profile_id()));
CREATE POLICY "System can insert analytics" ON public.sponsor_analytics FOR INSERT WITH CHECK (true);

-- User safety settings: only owner
CREATE POLICY "Users can view own safety settings" ON public.user_safety_settings FOR SELECT USING (user_id = current_profile_id());
CREATE POLICY "Users can manage own safety settings" ON public.user_safety_settings FOR ALL USING (user_id = current_profile_id());

-- Message requests: sender and receiver
CREATE POLICY "Users can view their message requests" ON public.message_requests FOR SELECT 
  USING (sender_id = current_profile_id() OR receiver_id = current_profile_id());
CREATE POLICY "Users can send message requests" ON public.message_requests FOR INSERT WITH CHECK (sender_id = current_profile_id());
CREATE POLICY "Receivers can update message requests" ON public.message_requests FOR UPDATE USING (receiver_id = current_profile_id());

-- Hub content: viewable by all
CREATE POLICY "Hub content is viewable by all" ON public.hub_content FOR SELECT USING (true);

-- Check-in prompts: viewable by all authenticated
CREATE POLICY "Check-in prompts viewable by authenticated" ON public.checkin_prompts FOR SELECT USING (auth.uid() IS NOT NULL);

-- User check-ins: only owner
CREATE POLICY "Users can manage own check-ins" ON public.user_checkins FOR ALL USING (user_id = current_profile_id());

-- Function to get effective safety level between two users (strictest wins)
CREATE OR REPLACE FUNCTION public.get_dm_safety_level(user1_id UUID, user2_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  level1 TEXT;
  level2 TEXT;
  levels TEXT[] := ARRAY['protected', 'moderate', 'minimal'];
BEGIN
  SELECT COALESCE(content_filter_level, 'moderate') INTO level1
  FROM user_safety_settings WHERE user_id = user1_id;
  
  SELECT COALESCE(content_filter_level, 'moderate') INTO level2
  FROM user_safety_settings WHERE user_id = user2_id;
  
  level1 := COALESCE(level1, 'moderate');
  level2 := COALESCE(level2, 'moderate');
  
  -- Return strictest (lowest index wins)
  IF array_position(levels, level1) < array_position(levels, level2) THEN
    RETURN level1;
  ELSE
    RETURN level2;
  END IF;
END;
$$;

-- Function to check if user can receive DMs from sender
CREATE OR REPLACE FUNCTION public.can_send_dm(sender_id UUID, receiver_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dm_filter TEXT;
  are_friends BOOLEAN;
BEGIN
  -- Get receiver's DM filter setting
  SELECT COALESCE(uss.dm_filter, 'friends_only') INTO dm_filter
  FROM user_safety_settings uss WHERE uss.user_id = receiver_id;
  
  dm_filter := COALESCE(dm_filter, 'friends_only');
  
  IF dm_filter = 'everyone' THEN
    RETURN true;
  ELSIF dm_filter = 'nobody' THEN
    RETURN false;
  ELSE
    -- Check if they're friends
    SELECT EXISTS (
      SELECT 1 FROM friend_requests fr
      WHERE fr.status = 'accepted'
        AND ((fr.sender_id = sender_id AND fr.receiver_id = receiver_id)
             OR (fr.sender_id = receiver_id AND fr.receiver_id = sender_id))
    ) INTO are_friends;
    
    RETURN are_friends;
  END IF;
END;
$$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_visibility ON public.events(visibility);
CREATE INDEX IF NOT EXISTS idx_events_is_featured ON public.events(is_featured);
CREATE INDEX IF NOT EXISTS idx_events_sponsor_id ON public.events(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_analytics_sponsor_id ON public.sponsor_analytics(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_analytics_content ON public.sponsor_analytics(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_message_requests_receiver ON public.message_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_hub_content_pillar ON public.hub_content(pillar, is_featured);
CREATE INDEX IF NOT EXISTS idx_user_checkins_user ON public.user_checkins(user_id, created_at DESC);

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_requests;