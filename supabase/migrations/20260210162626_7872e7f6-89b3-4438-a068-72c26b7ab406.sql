
CREATE OR REPLACE FUNCTION public.execute_admin_sql(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
  cleaned_sql text;
  is_select boolean;
BEGIN
  -- Strip trailing semicolons and whitespace
  cleaned_sql := rtrim(rtrim(sql_query), ';');
  cleaned_sql := rtrim(cleaned_sql);
  
  -- Determine if this is a SELECT/read query
  is_select := upper(ltrim(cleaned_sql)) ~ '^(SELECT|WITH|SHOW|EXPLAIN)';
  
  IF is_select THEN
    -- For SELECT queries, wrap in subquery to return results
    EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || cleaned_sql || ') t' INTO result;
    RETURN result;
  ELSE
    -- For write queries (INSERT/UPDATE/DELETE/CREATE/ALTER/DROP), execute directly
    EXECUTE cleaned_sql;
    -- Return a success message with affected info
    RETURN jsonb_build_object('message', 'Query executed successfully');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
END;
$$;

-- Revoke public access
REVOKE ALL ON FUNCTION public.execute_admin_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_admin_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.execute_admin_sql(text) FROM authenticated;
