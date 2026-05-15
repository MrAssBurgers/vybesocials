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
  console.log(`[CREATE-TIP] ${step}${detailsStr}`);
};

const PLATFORM_FEE_PCT = 15; // 15% platform fee on tips

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401
      });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401
      });
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;
    logStep("User authenticated", { userId });

    const {
      creator_id,
      amount,
      message,
      client_platform = 'web',
      wallet_preference = 'standard',
      native_shell = false,
    } = await req.json();
    if (!creator_id || !amount || amount < 1) {
      throw new Error("creator_id and amount (min $1) required");
    }
    if (amount > 500) throw new Error("Maximum tip is $500");

    // Get creator's Stripe Connect account
    const { data: creator, error: creatorError } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, stripe_connect_account_id, stripe_onboarding_complete, user_id')
      .eq('id', creator_id)
      .single();

    if (creatorError || !creator) throw new Error("Creator not found");
    if (creator.user_id === userId) throw new Error("Cannot tip yourself");

    const amountCents = Math.round(amount * 100);
    const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_PCT / 100);
    const creatorAmountCents = amountCents - platformFeeCents;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Build payment intent params
    const piParams: any = {
      amount: amountCents,
      currency: 'usd',
      metadata: {
        type: 'tip',
        creator_id: creator.id,
        tipper_id: userId,
        message: message?.substring(0, 200) || '',
        client_platform,
        wallet_preference,
        native_shell: String(native_shell),
      },
    };

    // If creator has Stripe Connect, use destination charge
    if (creator.stripe_connect_account_id && creator.stripe_onboarding_complete) {
      piParams.transfer_data = {
        destination: creator.stripe_connect_account_id,
        amount: creatorAmountCents,
      };
      logStep("Using destination charge", { destination: creator.stripe_connect_account_id });
    }

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    if (customers.data.length > 0) {
      piParams.customer = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({ email: userEmail });
      piParams.customer = customer.id;
    }

    // Create checkout session for the tip
    const session = await stripe.checkout.sessions.create({
      customer: piParams.customer,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Tip for creator`,
            description: message ? `"${message.substring(0, 100)}"` : 'Thank you tip',
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        metadata: piParams.metadata,
        ...(piParams.transfer_data ? { transfer_data: piParams.transfer_data } : {}),
      },
      success_url: `${req.headers.get("origin") || "https://vybeapp.lovable.app"}/tip-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin") || "https://vybeapp.lovable.app"}/tip-cancelled`,
    });

    // Record tip as pending
    await supabaseAdmin.from('tips').insert({
      tipper_id: userId,
      creator_id: creator.id,
      amount,
      message: message?.substring(0, 500) || null,
      stripe_payment_intent_id: session.id,
      status: 'pending',
      platform_fee: platformFeeCents / 100,
      creator_amount: creatorAmountCents / 100,
    });

    logStep("Tip checkout created", { sessionId: session.id });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
