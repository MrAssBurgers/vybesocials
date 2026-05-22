/**
 * connect-v2-checkout
 * ───────────────────
 * Creates a **direct-charge** Checkout Session on the connected account.
 *
 * Direct charges mean the payment is processed entirely by the connected
 * account's Stripe, and the platform earns revenue via `application_fee_amount`.
 *
 * Request body:
 *   {
 *     account_id: string,
 *     product_name: string,
 *     price_cents: number,
 *     quantity?: number,
 *     currency?: string,
 *   }
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

// ── Platform fee: 5% of the total ──────────────────────────────────────
// Adjust this to your desired revenue share.
const PLATFORM_FEE_PERCENT = 5;

const log = (step: string, details?: unknown) =>
  console.log(`[CONNECT-V2-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    // Accept a Stripe Price ID (set by the connected merchant) rather than a
    // client-supplied amount. This prevents payment-amount tampering.
    const { account_id, price_id, quantity } = await req.json();
    if (!account_id || typeof account_id !== "string" || !/^acct_[a-zA-Z0-9]+$/.test(account_id)) {
      throw new Error("Valid account_id is required");
    }
    if (!price_id || typeof price_id !== "string" || !/^price_[a-zA-Z0-9]+$/.test(price_id)) {
      throw new Error("Valid price_id is required");
    }

    const origin = safeOrigin(req);
    const stripeClient = new Stripe(stripeKey);

    const qty = Math.max(1, Math.min(99, Math.round(Number(quantity) || 1)));

    // Resolve the price from Stripe (on the connected account) so the actual
    // unit_amount is whatever the merchant set — not the caller.
    const price = await stripeClient.prices.retrieve(price_id, {}, { stripeAccount: account_id });
    if (!price || price.active === false) throw new Error("Price is not active");
    if (!price.unit_amount || price.unit_amount < 1) throw new Error("Invalid price amount");

    const totalCents = price.unit_amount * qty;
    const applicationFee = Math.round(totalCents * (PLATFORM_FEE_PERCENT / 100));

    // ── Create a Checkout Session as a direct charge ───────────────────
    // The session is created ON the connected account (stripeAccount header).
    // `application_fee_amount` routes the platform's cut automatically.
    const session = await stripeClient.checkout.sessions.create(
      {
        line_items: [{ price: price_id, quantity: qty }],
        payment_intent_data: {
          application_fee_amount: applicationFee, // Platform revenue
        },
        mode: "payment",
        success_url: `${origin}/connect/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/connect/storefront/${account_id}`,
      },
      {
        stripeAccount: account_id, // ← Direct charge on connected account
      },
    );

    log("Checkout session created", {
      sessionId: session.id,
      accountId: account_id,
      applicationFee,
    });

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
