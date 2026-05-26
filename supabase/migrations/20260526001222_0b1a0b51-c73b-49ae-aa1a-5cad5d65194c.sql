-- Remove overly broad SELECT policy
DROP POLICY IF EXISTS "View shared theme by direct id lookup (unlisted)" ON public.shared_themes;

-- SECURITY DEFINER lookup for the unlisted-link case: anyone authenticated who knows
-- the exact UUID can fetch just that one theme + creator profile fields.
CREATE OR REPLACE FUNCTION public.get_shared_theme_by_id(p_theme_id uuid)
RETURNS TABLE (
  id uuid,
  creator_id uuid,
  theme_name text,
  theme_tokens jsonb,
  layout_settings jsonb,
  description text,
  likes_count integer,
  downloads_count integer,
  is_public boolean,
  created_at timestamptz,
  tags text[],
  category text,
  creator_display_name text,
  creator_avatar_url text,
  creator_username text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.creator_id,
    t.theme_name,
    t.theme_tokens,
    t.layout_settings,
    t.description,
    t.likes_count,
    t.downloads_count,
    t.is_public,
    t.created_at,
    t.tags,
    t.category,
    p.display_name,
    p.avatar_url,
    p.username
  FROM public.shared_themes t
  LEFT JOIN public.profiles p ON p.id = t.creator_id
  WHERE t.id = p_theme_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_shared_theme_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_theme_by_id(uuid) TO authenticated, anon;
