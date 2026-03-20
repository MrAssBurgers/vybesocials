/**
 * connect-v2-account-status
 * ─────────────────────────
 * Retrieves the current status of a V2 Connected Account directly from
 * the Stripe API.  We intentionally do NOT cache this in a database for
 * this demo so you always see the live status.
 *
 * The response tells the caller:
 *   • Whether card_payments capability is active (ready to process payments)
 *   • Whether onboarding requirements are satisfied
 *
 * Query params:
 *   ?account_id=acct_xxx
 *
 * Returns:
 *   { account_id, display_name, ready_to_process_payments, onboarding_complete, requirements_status, details }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.1";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[CONNECT-V2-STATUS] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    log("Function invoked");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    // Read account_id from query string or JSON body
    const url = new URL(req.url);
    let accountId = url.searchParams.get("account_id");
    if (!accountId && req.method === "POST") {
      const body = await req.json();
      accountId = body.account_id;
    }
    if (!accountId) throw new Error("account_id is required (query param or body)");

    const stripeClient = new Stripe(stripeKey);

    // ── Retrieve the V2 account with expanded config & requirements ────
    // The `include` parameter fetches nested objects in one call.
    const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
      include: ["configuration.merchant", "requirements"],
    });

    // ── Determine payment readiness ────────────────────────────────────
    // card_payments status will be "active" when the account can process charges.
    const readyToProcessPayments =
      (account as any)?.configuration?.merchant?.capabilities?.card_payments?.status === "active";

    // ── Determine onboarding completion ────────────────────────────────
    // If the requirements summary has "currently_due" or "past_due", the
    // account still needs to provide information.
    const requirementsStatus =
      (account as any)?.requirements?.summary?.minimum_deadline?.status;
    const onboardingComplete =
      requirementsStatus !== "currently_due" && requirementsStatus !== "past_due";

    log("Status retrieved", {
      accountId,
      readyToProcessPayments,
      onboardingComplete,
      requirementsStatus,
    });

    return new Response(
      JSON.stringify({
        account_id: accountId,
        display_name: (account as any).display_name || null,
        ready_to_process_payments: readyToProcessPayments,
        onboarding_complete: onboardingComplete,
        requirements_status: requirementsStatus || "none",
        details: {
          card_payments_status:
            (account as any)?.configuration?.merchant?.capabilities?.card_payments?.status || "inactive",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
