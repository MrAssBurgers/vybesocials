import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is an admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Check admin role
    const { data: roles } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);

    const isAdmin = roles?.some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Forbidden: admin only");

    // Check existence of secrets (NEVER return values)
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeClientId = Deno.env.get("STRIPE_CLIENT_ID");
    const stripePublishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY");

    // Detect stripe mode from key prefix
    let stripe_mode = "unknown";
    if (stripeSecretKey) {
      stripe_mode = stripeSecretKey.startsWith("sk_live_") ? "live" : "test";
    }

    return new Response(JSON.stringify({
      STRIPE_SECRET_KEY: !!stripeSecretKey,
      STRIPE_CLIENT_ID: !!stripeClientId,
      STRIPE_PUBLISHABLE_KEY: !!stripePublishableKey,
      stripe_mode,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500,
    });
  }
});
