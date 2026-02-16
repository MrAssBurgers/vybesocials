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
  console.log(`[CHECK-CREATOR-CONNECT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    let stripeKey: string;
    try {
      stripeKey = await getStripeSecretKey();
      const keyCheck = validateStripeKey(stripeKey);
      if (!keyCheck.valid) {
        return new Response(
          JSON.stringify({ connected: false, onboarding_complete: false, stripe_not_configured: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ connected: false, onboarding_complete: false, stripe_not_configured: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { data: creator, error: creatorError } = await supabaseClient
      .from('creator_profiles')
      .select('id, stripe_connect_account_id, stripe_onboarding_complete')
      .eq('user_id', user.id)
      .single();

    if (creatorError || !creator) {
      return new Response(
        JSON.stringify({ connected: false, onboarding_complete: false, error: "No creator profile" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (!creator.stripe_connect_account_id) {
      return new Response(
        JSON.stringify({ connected: false, onboarding_complete: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const account = await stripe.accounts.retrieve(creator.stripe_connect_account_id);

    const isOnboardingComplete = account.charges_enabled && account.payouts_enabled && account.details_submitted;

    if (isOnboardingComplete !== creator.stripe_onboarding_complete) {
      await supabaseClient
        .from('creator_profiles')
        .update({ stripe_onboarding_complete: isOnboardingComplete })
        .eq('id', creator.id);
      logStep("Updated onboarding status", { isOnboardingComplete });
    }

    return new Response(
      JSON.stringify({
        connected: true,
        onboarding_complete: isOnboardingComplete,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        account_id: creator.stripe_connect_account_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage, connected: false, onboarding_complete: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
