/**
 * connect-v2-list-products
 * ────────────────────────
 * Lists active products on a connected account's Stripe for the storefront.
 * Uses the `stripeAccount` header so we read from the connected account.
 *
 * Query params:
 *   ?account_id=acct_xxx
 *
 * Returns:
 *   { products: Stripe.Product[] }  (each with `default_price` expanded)
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
  console.log(`[CONNECT-V2-PRODUCTS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const url = new URL(req.url);
    const accountId = url.searchParams.get("account_id");
    if (!accountId) throw new Error("account_id query param is required");

    const stripeClient = new Stripe(stripeKey);

    // ── List products on the connected account ─────────────────────────
    // `expand` brings in the full Price object so we can show price info.
    const products = await stripeClient.products.list(
      {
        limit: 20,
        active: true,
        expand: ["data.default_price"],
      },
      {
        stripeAccount: accountId, // ← Stripe-Account header
      },
    );

    log("Products fetched", { count: products.data.length, accountId });

    return new Response(JSON.stringify({ products: products.data }), {
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
