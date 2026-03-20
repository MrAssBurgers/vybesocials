/**
 * connect-v2-create-account
 * ─────────────────────────
 * Creates a Stripe Connected Account using the **V2 Accounts API**.
 *
 * The V2 API replaces the older `type: 'express' | 'standard' | 'custom'`
 * pattern with a configuration-driven model.  We request `card_payments`
 * capability under the `merchant` configuration and let Stripe handle
 * fee & loss collection (`fees_collector` / `losses_collector` = 'stripe').
 *
 * The account ID is stored in the `business_profiles` table so we can
 * look it up later without hitting Stripe.
 *
 * Request body:
 *   { display_name: string, contact_email: string }
 *
 * Returns:
 *   { account_id: string }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.1";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[CONNECT-V2-CREATE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    // ── 1. Resolve and validate Stripe secret key ──────────────────────
    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    // ── 2. Authenticate the calling user via Supabase JWT ──────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Authentication failed");
    const user = userData.user;
    log("Authenticated", { userId: user.id });

    // ── 3. Parse request body ──────────────────────────────────────────
    const { display_name, contact_email } = await req.json();
    if (!display_name) throw new Error("display_name is required");
    if (!contact_email) throw new Error("contact_email is required");

    // ── 4. Create the V2 Connected Account ─────────────────────────────
    // IMPORTANT: Do NOT pass `type` at the top level. V2 accounts use
    // `configuration` blocks instead.
    const stripeClient = new Stripe(stripeKey);

    const account = await stripeClient.v2.core.accounts.create({
      display_name,
      contact_email,
      identity: {
        country: "us", // Change to the appropriate country for your use-case
      },
      dashboard: "full", // Give the connected account access to the full Stripe Dashboard
      defaults: {
        responsibilities: {
          fees_collector: "stripe",   // Stripe collects fees from the connected account
          losses_collector: "stripe", // Stripe covers losses (disputes, refunds)
        },
      },
      configuration: {
        customer: {}, // Enable the customer configuration (required for subscriptions)
        merchant: {
          capabilities: {
            card_payments: {
              requested: true, // Request card-payment capability
            },
          },
        },
      },
    });

    log("Account created", { accountId: account.id });

    // ── 5. Persist the mapping: user → Stripe account ID ───────────────
    // We store it on the user's business_profiles row.  If your schema
    // differs, adjust the table / column names here.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (profile) {
      const { data: business } = await supabaseAdmin
        .from("business_profiles")
        .select("id")
        .eq("owner_id", profile.id)
        .maybeSingle();

      if (business) {
        await supabaseAdmin
          .from("business_profiles")
          .update({
            stripe_account_id: account.id,
            stripe_onboarding_complete: false,
          })
          .eq("id", business.id);
        log("Stored account ID on business_profiles", { businessId: business.id });
      }
    }

    return new Response(JSON.stringify({ account_id: account.id }), {
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
