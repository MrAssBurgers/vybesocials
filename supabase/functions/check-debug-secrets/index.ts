import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Unauthorized");

    // Check both user_roles_auth (auth-keyed) and user_roles (profile-keyed)
    const { data: rolesAuth } = await adminClient
      .from("user_roles_auth")
      .select("role")
      .eq("user_id", userData.user.id);
    let isAdminOrOwner = rolesAuth?.some((r: any) => r.role === "admin" || r.role === "owner");

    if (!isAdminOrOwner) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (profile) {
        const { data: roles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id);
        isAdminOrOwner = roles?.some((r: any) => r.role === "admin" || r.role === "owner");
      }
    }
    if (!isAdminOrOwner) throw new Error("Forbidden: admin only");

    // Check env vars first, then fall back to app_secrets table
    let stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    let stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";

    // Check app_secrets table for keys saved via Owner Settings
    const { data: dbSecrets } = await adminClient
      .from("app_secrets")
      .select("key, value")
      .in("key", ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);

    if (dbSecrets) {
      for (const row of dbSecrets) {
        // Prefer DB value if env var is missing OR is a restricted key (rk_)
        if (row.key === "STRIPE_SECRET_KEY" && row.value && (!stripeSecretKey || stripeSecretKey.startsWith("rk_"))) {
          stripeSecretKey = row.value;
        }
        if (row.key === "STRIPE_WEBHOOK_SECRET" && row.value && !stripeWebhookSecret) {
          stripeWebhookSecret = row.value;
        }
      }
    }

    // Also check stripe_config table for publishable key & mode
    const { data: stripeConfig } = await adminClient
      .from("stripe_config")
      .select("stripe_enabled, stripe_mode, stripe_publishable_key")
      .limit(1)
      .maybeSingle();

    // Detect stripe mode from secret key prefix, or from config
    let stripe_mode = "unknown";
    if (stripeSecretKey) {
      stripe_mode = stripeSecretKey.startsWith("sk_live_") ? "live" : "test";
    } else if (stripeConfig?.stripe_mode) {
      stripe_mode = stripeConfig.stripe_mode;
    }

    // Determine if secrets exist (env OR db)
    const hasSecretKey = !!stripeSecretKey;
    const hasWebhookSecret = !!stripeWebhookSecret;
    const hasDbSecretKey = dbSecrets?.some((s: any) => s.key === "STRIPE_SECRET_KEY" && s.value) ?? false;

    // STRIPE_CLIENT_ID comes from env only (Stripe Connect platform ID)
    const stripeClientId = Deno.env.get("STRIPE_CLIENT_ID");

    // STRIPE_PUBLISHABLE_KEY from stripe_config table
    const hasPublishableKey = !!stripeConfig?.stripe_publishable_key;

    return new Response(JSON.stringify({
      STRIPE_SECRET_KEY: hasSecretKey || hasDbSecretKey,
      STRIPE_CLIENT_ID: !!stripeClientId,
      STRIPE_PUBLISHABLE_KEY: hasPublishableKey,
      STRIPE_WEBHOOK_SECRET: hasWebhookSecret,
      stripe_mode,
      stripe_enabled: stripeConfig?.stripe_enabled ?? false,
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
