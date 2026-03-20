/**
 * connect-v2-billing-portal
 * ─────────────────────────
 * Creates a Stripe Billing Portal session so a connected account can
 * manage their platform subscription (cancel, change payment method, etc).
 *
 * With V2 accounts, use `customer_account` instead of `customer`.
 *
 * PREREQUISITE: You must activate the Customer Portal in your Stripe
 * Dashboard → Settings → Billing → Customer Portal.
 * See: https://docs.stripe.com/customer-management/activate-no-code-customer-portal
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
  console.log(`[CONNECT-V2-PORTAL] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const { account_id } = await req.json();
    if (!account_id) throw new Error("account_id is required");

    const origin =
      req.headers.get("origin") ||
      req.headers.get("referer")?.replace(/\/$/, "") ||
      "https://vybeapp.lovable.app";

    const stripeClient = new Stripe(stripeKey);

    // ── Create a Billing Portal session for the connected account ──────
    // `customer_account` works with V2 accounts (acct_xxx).
    const session = await stripeClient.billingPortal.sessions.create({
      customer_account: account_id,
      return_url: `${origin}/connect/dashboard?accountId=${account_id}`,
    });

    log("Portal session created", { url: session.url, accountId: account_id });

    return new Response(JSON.stringify({ url: session.url }), {
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
