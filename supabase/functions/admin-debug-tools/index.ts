import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Check both user_roles_auth (auth-keyed) and user_roles (profile-keyed)
    const { data: rolesAuth } = await supabaseClient
      .from("user_roles_auth")
      .select("role")
      .eq("user_id", userData.user.id);
    let isAdmin = rolesAuth?.some((r: any) => r.role === "admin" || r.role === "owner");

    if (!isAdmin) {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (profile) {
        const { data: roles } = await supabaseClient
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id);
        isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "owner");
      }
    }
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { action, table_name, limit: queryLimit } = await req.json();

    if (action === "list_tables") {
      // Return key tables with row counts
      const tables = [
        "profiles", "posts", "comments", "likes", "follows",
        "conversations", "messages", "notifications", "reports",
        "user_roles", "badges", "user_badges", "challenges",
        "business_profiles", "business_products", "business_orders",
        "events", "communities", "channels", "analytics_events",
      ];

      const results = [];
      for (const t of tables) {
        const { count, error } = await supabaseClient
          .from(t)
          .select("*", { count: "exact", head: true });
        results.push({ name: t, count: error ? -1 : (count ?? 0), error: error?.message });
      }

      return new Response(JSON.stringify({ tables: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "preview_table") {
      const safeLimit = Math.min(queryLimit || 20, 50);
      const { data, error, count } = await supabaseClient
        .from(table_name)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(safeLimit);

      return new Response(JSON.stringify({ 
        data: data || [], 
        count: count ?? 0, 
        error: error?.message 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500,
    });
  }
});
