
-- Channel permissions table: per-channel overrides for each role
CREATE TABLE public.channel_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_send BOOLEAN NOT NULL DEFAULT true,
  can_manage BOOLEAN NOT NULL DEFAULT false,
  can_pin BOOLEAN NOT NULL DEFAULT false,
  can_attach_media BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, role)
);

ALTER TABLE public.channel_permissions ENABLE ROW LEVEL SECURITY;

-- Anyone in the server can view channel permissions
CREATE POLICY "Server members can view channel permissions"
  ON public.channel_permissions FOR SELECT
  USING (
    public.is_server_member(
      (SELECT server_id FROM public.channels WHERE id = channel_id)
    )
  );

-- Only owner/admin can manage channel permissions
CREATE POLICY "Admins can manage channel permissions"
  ON public.channel_permissions FOR ALL
  USING (
    public.get_server_role(
      (SELECT server_id FROM public.channels WHERE id = channel_id)
    ) IN ('owner', 'admin')
  )
  WITH CHECK (
    public.get_server_role(
      (SELECT server_id FROM public.channels WHERE id = channel_id)
    ) IN ('owner', 'admin')
  );

-- Seed default permissions for all existing channels
INSERT INTO public.channel_permissions (channel_id, role, can_view, can_send, can_manage, can_pin, can_attach_media)
SELECT c.id, r.role, true, 
  CASE WHEN r.role = 'member' THEN true ELSE true END,
  CASE WHEN r.role IN ('owner', 'admin') THEN true ELSE false END,
  CASE WHEN r.role IN ('owner', 'admin', 'moderator') THEN true ELSE false END,
  true
FROM public.channels c
CROSS JOIN (VALUES ('owner'), ('admin'), ('moderator'), ('member')) AS r(role)
ON CONFLICT DO NOTHING;

-- Function to auto-create default permissions when a new channel is created
CREATE OR REPLACE FUNCTION public.create_default_channel_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.channel_permissions (channel_id, role, can_view, can_send, can_manage, can_pin, can_attach_media)
  VALUES
    (NEW.id, 'owner', true, true, true, true, true),
    (NEW.id, 'admin', true, true, true, true, true),
    (NEW.id, 'moderator', true, true, false, true, true),
    (NEW.id, 'member', true, true, false, false, true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_create_channel_permissions
  AFTER INSERT ON public.channels
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_channel_permissions();

-- Helper function to check a specific permission for current user on a channel
CREATE OR REPLACE FUNCTION public.check_channel_permission(p_channel_id uuid, p_permission text)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server_id uuid;
  v_role text;
  v_result boolean;
BEGIN
  SELECT server_id INTO v_server_id FROM channels WHERE id = p_channel_id;
  IF v_server_id IS NULL THEN RETURN false; END IF;
  
  v_role := get_server_role(v_server_id);
  IF v_role IS NULL THEN RETURN false; END IF;
  
  -- Owner always has all permissions
  IF v_role = 'owner' THEN RETURN true; END IF;
  
  EXECUTE format(
    'SELECT %I FROM channel_permissions WHERE channel_id = $1 AND role = $2',
    p_permission
  ) INTO v_result USING p_channel_id, v_role;
  
  RETURN COALESCE(v_result, false);
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_permissions;
