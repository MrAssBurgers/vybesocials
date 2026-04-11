-- 1. PROFILES: Column-level security for sensitive PII
-- Revoke all column-level SELECT on sensitive columns, then re-grant via table-level for non-sensitive
REVOKE SELECT (email, phone_number, date_of_birth, stripe_customer_id) ON public.profiles FROM anon;
REVOKE SELECT (email, phone_number, date_of_birth, stripe_customer_id) ON public.profiles FROM authenticated;

-- 2. CHAT-MEDIA: Add ownership check to SELECT policy
DROP POLICY IF EXISTS "Auth users view chat media" ON storage.objects;

CREATE POLICY "Auth users view own chat media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Also create a SECURITY DEFINER function for cross-user chat media access
-- (needed for conversation members to see each other's media)
CREATE OR REPLACE FUNCTION public.is_conversation_member_for_media(
  _file_owner_id uuid,
  _requesting_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_members cm1
    JOIN conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
    WHERE cm1.user_id = (SELECT id FROM profiles WHERE user_id = _file_owner_id LIMIT 1)
      AND cm2.user_id = (SELECT id FROM profiles WHERE user_id = _requesting_user_id LIMIT 1)
  )
$$;

-- Update the chat media policy to allow conversation members
DROP POLICY IF EXISTS "Auth users view own chat media" ON storage.objects;

CREATE POLICY "Auth users view conversation chat media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (
    -- Own media
    (auth.uid())::text = (storage.foldername(name))[1]
    -- Or media from a conversation member
    OR public.is_conversation_member_for_media(
      (storage.foldername(name))[1]::uuid,
      auth.uid()
    )
  )
);

-- 3. BUSINESS PROFILES: Tighten SELECT to hide stripe_account_id from non-owners
-- The public view already handles this, but restrict base table direct access
REVOKE SELECT (stripe_account_id, total_revenue) ON public.business_profiles FROM anon;
REVOKE SELECT (stripe_account_id, total_revenue) ON public.business_profiles FROM authenticated;