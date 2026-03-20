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
  console.log(`[STRIPE-DASHBOARD-LINK] ${step}${detailsStr}`);
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
    logStep("Stripe key verified", { mode: keyCheck.mode, keyLength: stripeKey.length });

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
      .select("id, stripe_account_id")
      .eq("owner_id", profile.id)
      .single();

    if (bizError || !business) throw new Error("Business profile not found");
    if (!business.stripe_account_id) throw new Error("No Stripe account connected");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    try {
      const loginLink = await stripe.accounts.createLoginLink(business.stripe_account_id);
      logStep("Dashboard link created", { url: loginLink.url });

      return new Response(
        JSON.stringify({ url: loginLink.url }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!isStripeAccountAccessError(errorMessage)) {
        throw error;
      }

      logStep("Stored Stripe account is stale, resetting before dashboard open", {
        businessId: business.id,
        accountId: business.stripe_account_id,
        message: errorMessage,
      });
      await resetBusinessStripeConnection(supabaseClient, business.id);

      return new Response(
        JSON.stringify({
          ok: false,
          code: "reconnect_required",
          error: STALE_BUSINESS_CONNECTION_MESSAGE,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
