import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { validateStripeKey } from "../_shared/stripe-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[VALIDATE-STRIPE-CONFIG] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const userId = userData.user.id;
    logStep("User authenticated", { userId });

    // Admin check
    const { data: isOwnerResult } = await supabaseClient.rpc('is_owner', { _user_id: userId });
    if (!isOwnerResult) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const body = await req.json();
    const { stripe_mode, stripe_publishable_key, stripe_enabled } = body;

    const errors: string[] = [];

    // Validate publishable key format
    if (stripe_enabled && !stripe_publishable_key?.trim()) {
      errors.push("Publishable key is required when Stripe is enabled");
    }

    if (stripe_publishable_key?.trim()) {
      const pk = stripe_publishable_key.trim();
      if (stripe_mode === 'live' && pk.startsWith('pk_test_')) {
        errors.push("Live mode selected but publishable key is a test key");
      }
      if (stripe_mode === 'test' && pk.startsWith('pk_live_')) {
        errors.push("Test mode selected but publishable key is a live key");
      }
    }

    // Validate secret key matches mode (check env first, then app_secrets table)
    let secretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!secretKey) {
      // Fallback: check app_secrets table
      const { data: secretRow } = await supabaseClient
        .from("app_secrets")
        .select("value")
        .eq("key", "STRIPE_SECRET_KEY")
        .maybeSingle();
      if (secretRow?.value) secretKey = secretRow.value;
    }

    if (stripe_enabled && secretKey) {
      const keyValidation = validateStripeKey(secretKey);
      if (!keyValidation.valid) {
        errors.push(keyValidation.error!);
      } else {
        if (stripe_mode === 'live' && keyValidation.mode === 'test') {
          errors.push("Live mode selected but the stored secret key is a test key. Update STRIPE_SECRET_KEY.");
        }
        if (stripe_mode === 'test' && keyValidation.mode === 'live') {
          errors.push("Test mode selected but the stored secret key is a live key. Update STRIPE_SECRET_KEY.");
        }
      }
    } else if (stripe_enabled && !secretKey) {
      errors.push("STRIPE_SECRET_KEY is not configured. Add it via the secrets manager.");
    }

    logStep("Validation complete", { errors });

    return new Response(JSON.stringify({
      valid: errors.length === 0,
      errors,
      secret_key_present: !!secretKey,
      secret_key_mode: secretKey
        ? (secretKey.startsWith('sk_test_') ? 'test' : secretKey.startsWith('sk_live_') ? 'live' : 'unknown')
        : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
