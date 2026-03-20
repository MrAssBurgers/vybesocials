/**
 * connect-v2-create-product
 * ─────────────────────────
 * Creates a Product (with a default Price) on a **connected account** using
 * the `stripeAccount` header (Stripe-Account).  This means the product
 * lives entirely on the connected account's Stripe, not on the platform.
 *
 * Request body:
 *   { account_id: string, name: string, description?: string, price_cents: number, currency?: string }
 *
 * Returns:
 *   { product: Stripe.Product }
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
  console.log(`[CONNECT-V2-PRODUCT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const { account_id, name, description, price_cents, currency } = await req.json();
    if (!account_id) throw new Error("account_id is required");
    if (!name) throw new Error("name is required");
    if (!price_cents || price_cents < 1) throw new Error("price_cents must be a positive integer");

    const stripeClient = new Stripe(stripeKey);

    // ── Create a product with a default price on the connected account ─
    // The `stripeAccount` option sends the Stripe-Account header, making
    // this product belong to the connected account.
    const product = await stripeClient.products.create(
      {
        name,
        description: description || undefined,
        default_price_data: {
          unit_amount: Math.round(price_cents),
          currency: currency || "usd",
        },
      },
      {
        stripeAccount: account_id, // ← Stripe-Account header
      },
    );

    log("Product created", { productId: product.id, accountId: account_id });

    return new Response(JSON.stringify({ product }), {
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
