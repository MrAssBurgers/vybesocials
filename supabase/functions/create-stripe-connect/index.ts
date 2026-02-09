import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set in this environment. Please publish your project to sync secrets.");
    
    // Log key type for debugging (never log the actual key)
    const keyPrefix = stripeKey.substring(0, 7);
    logStep("Stripe key verified", { keyPrefix, keyLength: stripeKey.length });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    
    // Use service role client for database operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("ERROR - No authorization header");
      return new Response(
        JSON.stringify({ error: "No authorization header provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    logStep("Token extracted", { tokenLength: token.length });
    
    // Create client with user's auth context for getUser validation
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    });
    
    // Use getUser with the authenticated client - this validates the JWT
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    
    if (userError || !userData?.user) {
      logStep("ERROR - Auth validation failed", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Invalid authentication token" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    
    const user = userData.user;
    if (!user.email) {
      return new Response(
        JSON.stringify({ error: "User email not available" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Get user's profile ID
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .single();
    
    if (profileError || !profile) throw new Error("Profile not found");
    logStep("Profile found", { profileId: profile.id });

    // Get the user's business profile
    const { data: business, error: bizError } = await supabaseAdmin
      .from('business_profiles')
      .select('id, name, stripe_account_id')
      .eq('owner_id', profile.id)
      .single();

    if (bizError || !business) throw new Error("Business profile not found");
    logStep("Business found", { businessId: business.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    let accountId = business.stripe_account_id;

    // Create Stripe Connect account if doesn't exist
    if (!accountId) {
      logStep("Creating new Stripe Connect account");

      try {
        const account = await stripe.accounts.create({
          type: 'express',
          email: user.email,
          business_type: 'individual',
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

        accountId = account.id;
        logStep("Stripe account created", { accountId });

        // Save the account ID to the business profile
        await supabaseAdmin
          .from('business_profiles')
          .update({ stripe_account_id: accountId })
          .eq('id', business.id);

        logStep("Account ID saved to business profile");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (isStripeConnectNotEnabledError(message)) {
          logStep("ERROR - Stripe Connect not enabled on platform", { message });
          return new Response(
            JSON.stringify({
              ok: false,
              error:
                "Payments setup isn't enabled yet. Enable Stripe Connect for your Stripe account, then try again.",
              code: "connect_not_enabled",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (isPlatformProfileIncomplete(message)) {
          logStep("ERROR - Stripe Platform Profile incomplete", { message });
          return new Response(
            JSON.stringify({
              ok: false,
              error:
                "Complete your Stripe Connect setup first. Go to Stripe Dashboard → Settings → Connect → Platform Profile and review the required settings.",
              code: "platform_profile_incomplete",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        throw err;
      }
    }


    // Create account onboarding link — use request origin for environment-aware redirects
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, '') || "https://vybeapp.lovable.app";
    logStep("Using origin for redirects", { origin });
    
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/business?stripe_refresh=true`,
      return_url: `${origin}/business?stripe_success=true`,
      type: 'account_onboarding',
    });

    logStep("Account link created", { url: accountLink.url });

    return new Response(
      JSON.stringify({ url: accountLink.url, accountId }),
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
