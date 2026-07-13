
-- 1) business_products: strip digital_file_url from the public-read policy path
--    RLS is row-level, so restrict column privileges and expose the URL only
--    via a SECURITY DEFINER helper that checks ownership / paid orders.

REVOKE SELECT (digital_file_url) ON public.business_products FROM anon;
REVOKE SELECT (digital_file_url) ON public.business_products FROM authenticated;
GRANT  SELECT (digital_file_url) ON public.business_products TO service_role;

CREATE OR REPLACE FUNCTION public.get_business_product_digital_url(_product_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_business uuid;
  v_url text;
  v_is_owner boolean := false;
  v_has_paid boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT bp.business_id, bp.digital_file_url
    INTO v_business, v_url
  FROM public.business_products bp
  WHERE bp.id = _product_id;

  IF v_url IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.business_profiles b
    JOIN public.profiles p ON p.id = b.owner_id
    WHERE b.id = v_business
      AND p.user_id = v_uid
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RETURN v_url;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.business_orders o
    JOIN public.profiles p ON p.id = o.customer_id
    WHERE p.user_id = v_uid
      AND o.business_id = v_business
      AND o.payment_status = 'paid'
      AND (
        o.items @> jsonb_build_array(jsonb_build_object('product_id', _product_id::text))
        OR o.items @> jsonb_build_array(jsonb_build_object('id', _product_id::text))
      )
  ) INTO v_has_paid;

  IF v_has_paid THEN
    RETURN v_url;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_product_digital_url(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_product_digital_url(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_product_digital_url(uuid) TO service_role;


-- 2) live_music_presence: honor per-user music_settings visibility toggles
DROP POLICY IF EXISTS "anyone read live_music_presence" ON public.live_music_presence;

CREATE POLICY "read live_music_presence with privacy"
ON public.live_music_presence
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.music_settings ms
    WHERE ms.user_id = live_music_presence.user_id
      AND COALESCE(ms.show_listening_activity, true) = true
  )
);
