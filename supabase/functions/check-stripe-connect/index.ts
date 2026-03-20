import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";
import {
  STALE_BUSINESS_CONNECTION_MESSAGE,
  isStripeAccountAccessError,
  resetBusinessStripeConnection,
} from "../_shared/stripe-connect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-STRIPE-CONNECT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    let stripeKey: string;
    let keyMode: string | undefined;
    try {
      stripeKey = await getStripeSecretKey();
      const keyCheck = validateStripeKey(stripeKey);
      if (!keyCheck.valid) {
        logStep("Invalid Stripe key format", { error: keyCheck.error });
        return new Response(
          JSON.stringify({ connected: false, onboarding_complete: false, stripe_not_configured: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      keyMode = keyCheck.mode;
    } catch {
      logStep("Stripe key not configured, returning gracefully");
      return new Response(
        JSON.stringify({ connected: false, onboarding_complete: false, stripe_not_configured: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }
    logStep("Stripe key verified", { mode: keyMode, keyLength: stripeKey.length });

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);

    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) throw new Error("Profile not found");

    const { data: business, error: bizError } = await supabaseClient
      .from("business_profiles")
      .select("id, stripe_account_id, stripe_onboarding_complete")
      .eq("owner_id", profile.id)
      .single();

    if (bizError || !business) {
      return new Response(
        JSON.stringify({
          connected: false,
          onboarding_complete: false,
          error: "No business profile",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (!business.stripe_account_id) {
      return new Response(
        JSON.stringify({
          connected: false,
          onboarding_complete: false,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let account;
    try {
      account = await stripe.accounts.retrieve(business.stripe_account_id);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!isStripeAccountAccessError(errorMessage)) {
        throw error;
      }

      logStep("Stored Stripe account is stale, resetting connection", {
        businessId: business.id,
        accountId: business.stripe_account_id,
        message: errorMessage,
      });

      await resetBusinessStripeConnection(supabaseClient, business.id);

      return new Response(
        JSON.stringify({
          connected: false,
          onboarding_complete: false,
          needs_reconnect: true,
          error: STALE_BUSINESS_CONNECTION_MESSAGE,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    logStep("Retrieved Stripe account", {
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });

    const isOnboardingComplete = account.charges_enabled && account.payouts_enabled && account.details_submitted;

    if (isOnboardingComplete !== business.stripe_onboarding_complete) {
      await supabaseClient
        .from("business_profiles")
        .update({ stripe_onboarding_complete: isOnboardingComplete })
        .eq("id", business.id);
      logStep("Updated onboarding status in database", { isOnboardingComplete });
    }

    return new Response(
      JSON.stringify({
        connected: true,
        onboarding_complete: isOnboardingComplete,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        account_id: business.stripe_account_id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage, connected: false, onboarding_complete: false }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
