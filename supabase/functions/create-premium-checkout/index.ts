import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveStripeKey, validateStripeKey } from "../_shared/stripe-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Test and live price IDs for VYBE Premium
const PREMIUM_PRICES: Record<string, string> = {
  test: "price_1TCQhFCvnv9K2bAQeButRL6m",
  live: "price_1TCQhFCvnv9K2bAQeButRL6m", // Replace with live price ID once created
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    const stripeKey = await resolveStripeKey();
    
    // Validate key and determine mode
    const keyValidation = validateStripeKey(stripeKey);
    if (!keyValidation.valid) {
      throw new Error(`Invalid Stripe key: ${keyValidation.error}`);
    }
    
    const isLive = keyValidation.mode === "live";
    console.log(`[create-premium-checkout] Mode: ${keyValidation.mode}, User: ${user.email}`);

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Use the correct price ID for the current mode
    const priceId = isLive ? PREMIUM_PRICES.live : PREMIUM_PRICES.test;

    // Check for existing customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;

      // Check if already subscribed
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      if (subs.data.length > 0) {
        return new Response(JSON.stringify({ error: "You already have an active premium subscription" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }
    }

    const origin = req.headers.get("origin") || (isLive ? "https://vybehub.app" : "https://vybeapp.lovable.app");

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/premium-success`,
      cancel_url: `${origin}/settings`,
      metadata: { user_id: user.id, mode: keyValidation.mode },
    });

    return new Response(JSON.stringify({ url: session.url, mode: keyValidation.mode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[create-premium-checkout] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
