/**
 * connect-v2-account-link
 * ───────────────────────
 * Creates a Stripe Account Link using the **V2 Account Links API** so the
 * connected account holder can complete onboarding inside the Stripe-hosted
 * onboarding flow.
 *
 * The `refresh_url` is where Stripe redirects if the link expires.
 * The `return_url` is where Stripe redirects after the user finishes.
 *
 * Request body:
 *   { account_id: string }
 *
 * Returns:
 *   { url: string }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.1";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[CONNECT-V2-LINK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const { account_id } = await req.json();
    if (!account_id) throw new Error("account_id is required");

    // Determine the origin so we can build return / refresh URLs
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "https://vybeapp.lovable.app";

    const stripeClient = new Stripe(stripeKey);

    // ── Create Account Link via the V2 API ─────────────────────────────
    // `configurations` lists which configuration types need onboarding.
    // We include both 'merchant' and 'customer' so the account can
    // accept payments AND be charged subscriptions.
    const accountLink = await stripeClient.v2.core.accountLinks.create({
      account: account_id,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "customer"],
          refresh_url: `${origin}/connect/dashboard?accountId=${account_id}&refresh=true`,
          return_url: `${origin}/connect/dashboard?accountId=${account_id}`,
        },
      },
    });

    log("Account link created", { url: accountLink.url });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
