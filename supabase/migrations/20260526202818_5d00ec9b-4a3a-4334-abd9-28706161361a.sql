
-- 1. Lock down execute_admin_sql to read-only queries
CREATE OR REPLACE FUNCTION public.execute_admin_sql(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  cleaned_sql text;
  normalized text;
BEGIN
  cleaned_sql := rtrim(rtrim(sql_query), ';');
  cleaned_sql := rtrim(cleaned_sql);

  -- Strip leading whitespace/comments for prefix detection
  normalized := upper(ltrim(regexp_replace(cleaned_sql, '/\*.*?\*/', ' ', 'gn')));

  -- Reject CTEs entirely (they can hide DML via WITH ... AS (UPDATE ...))
  IF normalized ~ '^WITH\b' THEN
    RETURN jsonb_build_object(
      'error',
      'CTEs (WITH ...) are not permitted in the admin SQL editor. Use a plain SELECT.'
    );
  END IF;

  -- Only allow read-only top-level statements
  IF normalized !~ '^(SELECT|SHOW|EXPLAIN)\b' THEN
    RETURN jsonb_build_object(
      'error',
      'Only read-only SELECT/SHOW/EXPLAIN queries are permitted via the admin SQL editor.'
    );
  END IF;

  -- Disallow embedded semicolons (multi-statement attempts)
  IF position(';' in cleaned_sql) > 0 THEN
    RETURN jsonb_build_object(
      'error',
      'Multi-statement queries are not permitted.'
    );
  END IF;

  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM ('
          || cleaned_sql || ') t'
    INTO result;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
END;
$function$;

-- 2. music_providers: hide api_key from client roles via column-level grants
REVOKE SELECT ON public.music_providers FROM anon, authenticated;
GRANT SELECT (provider_id, provider_name, api_base_url, is_active, created_at)
  ON public.music_providers TO authenticated;
-- service_role retains full access for edge functions (sync, test, etc.)

-- 3. spotify_connections: hide OAuth tokens from client roles
REVOKE SELECT ON public.spotify_connections FROM anon, authenticated;
GRANT SELECT (user_id, spotify_user_id, display_name, email, avatar_url,
              token_expires_at, scope, connected_at, updated_at)
  ON public.spotify_connections TO authenticated;
-- service_role retains full access for edge functions that need tokens
