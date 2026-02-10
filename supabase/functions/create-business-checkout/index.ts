import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-BUSINESS-CHECKOUT] ${step}${detailsStr}`);
};

// Platform fee percentage (5%)
const PLATFORM_FEE_PERCENT = 5;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);
    logStep("Stripe key verified", { mode: keyCheck.mode, keyLength: stripeKey.length });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Parse request body
    const { businessId, items, offerId } = await req.json();
    if (!businessId) throw new Error("Business ID is required");
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error("Items array is required");
    }
    logStep("Request parsed", { businessId, itemCount: items.length, offerId });

    // Get auth (optional for guest checkout)
    const authHeader = req.headers.get("Authorization");
    let user = null;
    let customerId = null;
    let customerEmail = null;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabaseClient.auth.getUser(token);
      user = userData.user;
      if (user?.email) {
        customerEmail = user.email;
        logStep("User authenticated", { userId: user.id, email: user.email });
      }
    }

    // Get business and their Stripe Connect account
    const { data: business, error: bizError } = await supabaseClient
      .from('business_profiles')
      .select('id, name, stripe_account_id, stripe_onboarding_complete')
      .eq('id', businessId)
      .single();

    if (bizError || !business) throw new Error("Business not found");
    if (!business.stripe_account_id) throw new Error("Business has not connected Stripe");
    if (!business.stripe_onboarding_complete) throw new Error("Business Stripe setup is incomplete");
    logStep("Business verified", { businessId: business.id, stripeAccountId: business.stripe_account_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer already exists in Stripe
    if (customerEmail) {
      const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Found existing Stripe customer", { customerId });
      }
    }

    // Build line items from request
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item: any) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.title,
          description: item.description || undefined,
        },
        unit_amount: Math.round(item.price * 100), // Convert to cents
      },
      quantity: item.quantity || 1,
    }));
    logStep("Line items built", { count: lineItems.length });

    // Calculate total for application fee
    const totalAmount = items.reduce((sum: number, item: any) => {
      return sum + (item.price * 100 * (item.quantity || 1));
    }, 0);
    const applicationFeeAmount = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));
    logStep("Fee calculated", { totalAmount, applicationFeeAmount, feePercent: PLATFORM_FEE_PERCENT });

    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, '') || "https://vybeapp.lovable.app";
    logStep("Using origin for redirects", { origin });

    // Create checkout session with connected account and application fee
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/order-cancelled`,
      payment_intent_data: {
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: business.stripe_account_id,
        },
      },
      metadata: {
        business_id: businessId,
        offer_id: offerId || '',
        customer_user_id: user?.id || '',
      },
    };

    // Add customer info
    if (customerId) {
      sessionParams.customer = customerId;
    } else if (customerEmail) {
      sessionParams.customer_email = customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(
      JSON.stringify({ 
        url: session.url, 
        sessionId: session.id,
        platformFee: applicationFeeAmount / 100,
        platformFeePercent: PLATFORM_FEE_PERCENT,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
