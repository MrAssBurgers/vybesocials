-- =============================================
-- VYBE COMMUNITIES REVAMP
-- Rename servers → communities, channels → rooms
-- Add room types and live activity support
-- =============================================

-- 1. Add new room_type enum and fields to channels table
ALTER TABLE public.channels 
  ADD COLUMN IF NOT EXISTS room_type text DEFAULT 'chat' 
    CHECK (room_type IN ('chat', 'announcements', 'media', 'live', 'qa'));

-- 2. Add cover_url and active_now_count to servers (now communities)
ALTER TABLE public.servers 
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS active_now_count integer DEFAULT 0;

-- 3. Create view for "communities" that aliases servers table
CREATE OR REPLACE VIEW public.communities AS
SELECT 
  id,
  name,
  description,
  icon_url,
  banner_url,
  cover_url,
  owner_id,
  invite_code,
  is_public,
  member_count,
  active_now_count,
  created_at
FROM public.servers;

-- 4. Create view for "rooms" that aliases channels table
CREATE OR REPLACE VIEW public.rooms AS
SELECT 
  id,
  server_id as community_id,
  name,
  description,
  type,
  room_type,
  position,
  is_private,
  created_at
FROM public.channels;

-- 5. Create view for community_members
CREATE OR REPLACE VIEW public.community_members AS
SELECT 
  id,
  server_id as community_id,
  user_id,
  CASE 
    WHEN role = 'owner' THEN 'owner'
    WHEN role IN ('admin', 'moderator') THEN 'moderator'
    ELSE 'member'
  END as role,
  nickname,
  joined_at
FROM public.server_members;

-- 6. Create live_activity table for tracking who is active/live
CREATE TABLE IF NOT EXISTS public.live_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.servers(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('browsing', 'chatting', 'live', 'listening')),
  room_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);

-- 7. Enable RLS on live_activity
ALTER TABLE public.live_activity ENABLE ROW LEVEL SECURITY;

-- 8. RLS policies for live_activity
CREATE POLICY "Members can view live activity" ON public.live_activity
  FOR SELECT USING (public.is_server_member(community_id));

CREATE POLICY "Users can manage own activity" ON public.live_activity
  FOR ALL USING (user_id = public.current_profile_id())
  WITH CHECK (user_id = public.current_profile_id());

-- 9. Function to update active_now_count on servers
CREATE OR REPLACE FUNCTION public.update_community_active_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Update the active count for the community
  UPDATE public.servers
  SET active_now_count = (
    SELECT COUNT(DISTINCT user_id)
    FROM public.live_activity
    WHERE community_id = COALESCE(NEW.community_id, OLD.community_id)
      AND last_seen_at > NOW() - INTERVAL '5 minutes'
  )
  WHERE id = COALESCE(NEW.community_id, OLD.community_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 10. Trigger to auto-update active count
DROP TRIGGER IF EXISTS update_active_count ON public.live_activity;
CREATE TRIGGER update_active_count
AFTER INSERT OR UPDATE OR DELETE ON public.live_activity
FOR EACH ROW EXECUTE FUNCTION public.update_community_active_count();

-- 11. Add default rooms for new communities (function)
CREATE OR REPLACE FUNCTION public.create_default_rooms(p_server_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.channels (server_id, name, type, room_type, position)
  VALUES 
    (p_server_id, 'Chat', 'text', 'chat', 0),
    (p_server_id, 'Announcements', 'announcement', 'announcements', 1),
    (p_server_id, 'Media', 'text', 'media', 2),
    (p_server_id, 'Live', 'voice', 'live', 3),
    (p_server_id, 'Q&A', 'text', 'qa', 4)
  ON CONFLICT DO NOTHING;
END;
$function$;

-- 12. Update existing channels to have room_type based on their current type
UPDATE public.channels 
SET room_type = CASE 
  WHEN type = 'announcement' THEN 'announcements'
  WHEN type = 'voice' THEN 'live'
  ELSE 'chat'
END
WHERE room_type IS NULL OR room_type = 'chat';

-- 13. Enable realtime for live_activity
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_activity;