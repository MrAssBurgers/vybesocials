-- Fix SECURITY DEFINER views - make them SECURITY INVOKER
-- This ensures RLS policies of the querying user are applied

-- Drop and recreate views with SECURITY INVOKER
DROP VIEW IF EXISTS public.communities;
DROP VIEW IF EXISTS public.rooms;
DROP VIEW IF EXISTS public.community_members;

-- Recreate communities view with SECURITY INVOKER
CREATE VIEW public.communities 
WITH (security_invoker = on)
AS
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

-- Recreate rooms view with SECURITY INVOKER
CREATE VIEW public.rooms 
WITH (security_invoker = on)
AS
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

-- Recreate community_members view with SECURITY INVOKER
CREATE VIEW public.community_members 
WITH (security_invoker = on)
AS
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