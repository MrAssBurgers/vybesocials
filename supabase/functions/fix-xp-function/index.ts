import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Drop both overloads so pending migrations can recreate them
    const { error: err1 } = await supabaseAdmin.rpc("exec_sql", {
      sql: "DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer)"
    });

    const { error: err2 } = await supabaseAdmin.rpc("exec_sql", {
      sql: "DROP FUNCTION IF EXISTS public.add_user_xp(uuid, integer, text)"
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        note: "Functions dropped. Pending migrations should now succeed.",
        errors: { err1: err1?.message, err2: err2?.message }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
