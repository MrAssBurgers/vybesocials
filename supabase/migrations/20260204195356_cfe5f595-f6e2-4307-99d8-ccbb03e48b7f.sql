-- =====================================================
-- FIX 5: Restrict invites table - only owner can see their invites
-- =====================================================

-- Create policy for owners to see their own invites
CREATE POLICY "Users can view own invites" 
ON public.invites 
FOR SELECT 
TO authenticated
USING (auth.uid() = inviter_id);

-- Create policy for validating invite codes (needed for redemption)
CREATE OR REPLACE FUNCTION public.validate_invite_code(_code text)
RETURNS TABLE (
  id uuid,
  invite_code text,
  max_uses integer,
  use_count integer,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, invite_code, max_uses, use_count, expires_at
  FROM public.invites
  WHERE invite_code = _code 
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR use_count < max_uses)
$$;

-- =====================================================
-- FIX 6: Create public_servers view without invite_code
-- =====================================================

CREATE OR REPLACE VIEW public.public_servers
WITH (security_invoker = on) AS
SELECT 
  s.id,
  s.name,
  s.description,
  s.icon_url,
  s.banner_url,
  s.cover_url,
  s.is_public,
  s.created_at,
  s.updated_at,
  s.owner_id,
  s.member_count,
  s.active_now_count
  -- Excludes: invite_code (sensitive)
FROM public.servers s
WHERE s.is_public = true;

GRANT SELECT ON public.public_servers TO authenticated;
GRANT SELECT ON public.public_servers TO anon;