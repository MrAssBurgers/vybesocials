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
  console.log(`[PROCESS-CREATOR-PAYOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user) throw new Error("Auth failed");
    const user = userData.user;

    // Get creator profile with Stripe account
    const { data: creator, error: creatorError } = await supabaseAdmin
      .from('creator_profiles')
      .select('id, stripe_connect_account_id, stripe_onboarding_complete, pending_payout')
      .eq('user_id', user.id)
      .single();

    if (creatorError || !creator) throw new Error("Creator profile not found");
    if (!creator.stripe_connect_account_id) throw new Error("Stripe Connect not set up");
    if (!creator.stripe_onboarding_complete) throw new Error("Stripe onboarding not complete");

    const { amount } = await req.json();
    if (!amount || amount <= 0) throw new Error("Invalid payout amount");
    if (amount > creator.pending_payout) throw new Error("Amount exceeds pending balance");

    logStep("Processing payout", { creatorId: creator.id, amount });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const amountCents = Math.round(amount * 100);

    // Create transfer to connected account
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: 'usd',
      destination: creator.stripe_connect_account_id,
      metadata: {
        creator_id: creator.id,
        user_id: user.id,
      },
    });

    logStep("Transfer created", { transferId: transfer.id });

    // Record the payout
    await supabaseAdmin
      .from('creator_payouts')
      .insert({
        creator_id: creator.id,
        amount,
        status: 'processing',
        stripe_payout_id: transfer.id,
      });

    // Reduce pending payout
    await supabaseAdmin
      .from('creator_profiles')
      .update({ pending_payout: creator.pending_payout - amount })
      .eq('id', creator.id);

    logStep("Payout recorded successfully");

    return new Response(
      JSON.stringify({ success: true, transfer_id: transfer.id }),
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
