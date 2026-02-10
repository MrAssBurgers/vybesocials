-- Create a secure SQL execution function for admin use only
CREATE OR REPLACE FUNCTION public.execute_admin_sql(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  -- This function is called only from edge functions after admin verification
  -- Execute the query and capture results
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || sql_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
END;
$$;

-- Revoke public access, only service role should call this
REVOKE ALL ON FUNCTION public.execute_admin_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_admin_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.execute_admin_sql(text) FROM authenticated;