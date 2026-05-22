import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";
import {
  isStripeAccountAccessError,
  resetBusinessStripeConnection,
} from "../_shared/stripe-connect.ts";
import { safeOrigin } from "../_shared/allowed-origins.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-STRIPE-CONNECT] ${step}${detailsStr}`);
};

const isStripeConnectNotEnabledError = (message: string) =>
  message.includes("signed up for Connect") || message.includes("sign up for Connect");

const isPlatformProfileIncomplete = (message: string) =>
  message.includes("responsibilities of managing losses") ||
  message.includes("platform-profile");

const buildSoftErrorResponse = (code: string, error: string) =>
  new Response(JSON.stringify({ ok: false, error, code }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });

const getStripeSetupSoftError = (message: string) => {
  if (isStripeConnectNotEnabledError(message)) {
    return buildSoftErrorResponse(
      "connect_not_enabled",
      "Payments setup isn't enabled yet. Enable Stripe Connect for your Stripe account, then try again.",
    );
  }

  if (isPlatformProfileIncomplete(message)) {
    return buildSoftErrorResponse(
      "platform_profile_incomplete",
      "Complete your Stripe Connect setup first. Go to Stripe Dashboard → Settings → Connect → Platform Profile and review the required settings.",
    );
  }

  return null;
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("ERROR - No authorization header");
      return new Response(
        JSON.stringify({ error: "No authorization header provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    logStep("Token extracted", { tokenLength: token.length });

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();

    if (userError || !userData?.user) {
      logStep("ERROR - Auth validation failed", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }

    const user = userData.user;
    if (!user.email) {
      return new Response(
        JSON.stringify({ error: "User email not available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 },
      );
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) throw new Error("Profile not found");
    logStep("Profile found", { profileId: profile.id });

    const { data: business, error: bizError } = await supabaseAdmin
      .from("business_profiles")
      .select("id, name, stripe_account_id")
      .eq("owner_id", profile.id)
      .single();

    if (bizError || !business) throw new Error("Business profile not found");
    logStep("Business found", { businessId: business.id, stripeAccountId: business.stripe_account_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const createConnectedAccount = async (): Promise<string | Response> => {
      logStep("Creating new Stripe Connect account");

      try {
        const account = await stripe.accounts.create({
          type: "express",
          email: user.email,
          business_type: "individual",
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          business_profile: {
            name: business.name,
          },
          metadata: {
            business_id: business.id,
            user_id: user.id,
          },
        });

        const accountId = account.id;
        logStep("Stripe account created", { accountId });

        await supabaseAdmin
          .from("business_profiles")
          .update({
            stripe_account_id: accountId,
            stripe_onboarding_complete: false,
          })
          .eq("id", business.id);

        logStep("Account ID saved to business profile", { accountId });
        return accountId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const softError = getStripeSetupSoftError(message);
        if (softError) {
          logStep("Handled Stripe setup error while creating account", { message });
          return softError;
        }

        throw err;
      }
    };

    let accountId = business.stripe_account_id;

    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId);
        logStep("Existing Stripe account verified", { accountId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!isStripeAccountAccessError(message)) throw err;

        logStep("Stored Stripe account is stale, resetting connection", { accountId, message });
        await resetBusinessStripeConnection(supabaseAdmin, business.id);
        accountId = null;
      }
    }

    if (!accountId) {
      const createdAccount = await createConnectedAccount();
      if (createdAccount instanceof Response) {
        return createdAccount;
      }
      accountId = createdAccount;
    }

    const origin = safeOrigin(req);
    logStep("Using origin for redirects", { origin, accountId });

    let accountLink;
    try {
      accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/business?stripe_refresh=true`,
        return_url: `${origin}/business?stripe_success=true`,
        type: "account_onboarding",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const softError = getStripeSetupSoftError(message);
      if (softError) {
        logStep("Handled Stripe setup error while creating onboarding link", { message });
        return softError;
      }

      if (!isStripeAccountAccessError(message)) {
        throw err;
      }

      logStep("Onboarding link failed due to stale account, recreating", { accountId, message });
      await resetBusinessStripeConnection(supabaseAdmin, business.id);

      const recreatedAccount = await createConnectedAccount();
      if (recreatedAccount instanceof Response) {
        return recreatedAccount;
      }
      accountId = recreatedAccount;

      accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/business?stripe_refresh=true`,
        return_url: `${origin}/business?stripe_success=true`,
        type: "account_onboarding",
      });
    }

    logStep("Account link created", { url: accountLink.url, accountId });

    return new Response(
      JSON.stringify({ url: accountLink.url, accountId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
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
