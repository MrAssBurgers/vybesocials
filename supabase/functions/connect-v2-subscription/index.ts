/**
 * connect-v2-subscription
 * ───────────────────────
 * Creates a Checkout Session in `subscription` mode that charges the
 * **connected account itself** (using `customer_account`).
 *
 * With V2 accounts, the connected account ID (acct_xxx) can be passed
 * as `customer_account` — Stripe treats the connected account as the
 * subscriber.  This is ideal for charging connected accounts a SaaS fee.
 *
 * Request body:
 *   { account_id: string }
 *
 * Returns:
 *   { url: string, session_id: string }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.1";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";
import { safeOrigin } from "../_shared/allowed-origins.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── PLACEHOLDER ───────────────────────────────────────────────────────
// Replace this with a real Price ID created on your **platform** account.
// You can create one via the Stripe Dashboard → Products → Add Product,
// or via the API.  It must be a recurring price (interval: month/year).
const PLATFORM_SUBSCRIPTION_PRICE_ID = Deno.env.get("CONNECT_SUBSCRIPTION_PRICE_ID") || "";
// If this is empty, the function returns a helpful error telling the
// developer what to configure.

const log = (step: string, details?: unknown) =>
  console.log(`[CONNECT-V2-SUB] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    if (!PLATFORM_SUBSCRIPTION_PRICE_ID) {
      throw new Error(
        "CONNECT_SUBSCRIPTION_PRICE_ID is not configured. " +
        "Create a recurring Price on your platform Stripe account and set the " +
        "CONNECT_SUBSCRIPTION_PRICE_ID environment variable / secret to its ID (price_xxx).",
      );
    }

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const { account_id } = await req.json();
    if (!account_id) throw new Error("account_id is required");

    const origin = safeOrigin(req);

    const stripeClient = new Stripe(stripeKey);

    // ── Create subscription checkout targeting the connected account ───
    // `customer_account` tells Stripe the connected account IS the customer.
    const session = await stripeClient.checkout.sessions.create({
      customer_account: account_id, // V2: connected account as subscriber
      mode: "subscription",
      line_items: [
        {
          price: PLATFORM_SUBSCRIPTION_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: `${origin}/connect/dashboard?accountId=${account_id}&subscribed=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/connect/dashboard?accountId=${account_id}`,
    });

    log("Subscription checkout created", { sessionId: session.id, accountId: account_id });

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
