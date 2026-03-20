/**
 * connect-v2-webhook-thin
 * ───────────────────────
 * Handles **thin** V2 webhook events for Connected Accounts.
 *
 * V2 account events use "thin" payloads — they contain only an event ID
 * and type.  You must fetch the full event object to get the data.
 *
 * Events handled:
 *   • v2.core.account[requirements].updated
 *     — Requirements changed (regulatory / card network updates)
 *   • v2.core.account[configuration.merchant].capability_status_updated
 *     — Merchant capability status changed
 *   • v2.core.account[configuration.customer].capability_status_updated
 *     — Customer capability status changed
 *
 * SETUP:
 *   1. In Stripe Dashboard → Developers → Webhooks → + Add destination
 *   2. Events from: "Connected accounts"
 *   3. Show advanced options → Payload style: "Thin"
 *   4. Select the three event types listed above
 *   5. Set the URL to: https://<project>.supabase.co/functions/v1/connect-v2-webhook-thin
 *   6. Copy the webhook signing secret and set it as CONNECT_V2_WEBHOOK_SECRET
 *
 * LOCAL TESTING (Stripe CLI):
 *   stripe listen --thin-events \
 *     'v2.core.account[requirements].updated,v2.core.account[configuration.merchant].capability_status_updated,v2.core.account[configuration.customer].capability_status_updated' \
 *     --forward-thin-to http://localhost:54321/functions/v1/connect-v2-webhook-thin
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.1";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const log = (step: string, details?: unknown) =>
  console.log(`[CONNECT-V2-WEBHOOK-THIN] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });

  try {
    log("Webhook received");

    // ── 1. Get secrets ─────────────────────────────────────────────────
    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    // ─── PLACEHOLDER ───────────────────────────────────────────────────
    // Set this secret via Lovable Cloud or Supabase dashboard.
    // It's the signing secret from the webhook endpoint you created above.
    const webhookSecret = Deno.env.get("CONNECT_V2_WEBHOOK_SECRET") || "";
    if (!webhookSecret) {
      throw new Error(
        "CONNECT_V2_WEBHOOK_SECRET is not configured. " +
        "Create a thin-event webhook in Stripe Dashboard and set the signing secret.",
      );
    }

    const stripeClient = new Stripe(stripeKey);

    // ── 2. Verify the thin event signature ─────────────────────────────
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new Error("Missing stripe-signature header");

    // `parseThinEvent` verifies the signature and returns { id, type }
    const thinEvent = stripeClient.parseThinEvent(body, sig, webhookSecret);
    log("Thin event parsed", { id: thinEvent.id, type: thinEvent.type });

    // ── 3. Fetch the full event to get the actual data ─────────────────
    const event = await stripeClient.v2.core.events.retrieve(thinEvent.id);
    log("Full event retrieved", { type: event.type });

    // ── 4. Handle each event type ──────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    switch (event.type) {
      case "v2.core.account[requirements].updated": {
        // Requirements changed — the connected account may need to
        // provide additional information.  You could notify the user
        // or flag their account in your database.
        const accountId = (event as any).related_object?.id;
        log("Requirements updated", { accountId });

        // TODO: Optionally update your database or send a notification
        // e.g. await supabaseAdmin.from("business_profiles")
        //   .update({ needs_attention: true })
        //   .eq("stripe_account_id", accountId);
        break;
      }

      case "v2.core.account[configuration.merchant].capability_status_updated": {
        // The merchant capability status changed (e.g. card_payments
        // went from "pending" to "active").
        const accountId = (event as any).related_object?.id;
        log("Merchant capability status updated", { accountId });

        // Fetch fresh status and update your DB
        if (accountId) {
          try {
            const account = await stripeClient.v2.core.accounts.retrieve(accountId, {
              include: ["configuration.merchant"],
            });
            const isActive =
              (account as any)?.configuration?.merchant?.capabilities?.card_payments?.status === "active";

            await supabaseAdmin
              .from("business_profiles")
              .update({ stripe_onboarding_complete: isActive })
              .eq("stripe_account_id", accountId);

            log("DB updated for merchant capability", { accountId, isActive });
          } catch (e) {
            log("Failed to update merchant capability in DB", { error: String(e) });
          }
        }
        break;
      }

      case "v2.core.account[configuration.customer].capability_status_updated": {
        // The customer configuration capability changed.
        const accountId = (event as any).related_object?.id;
        log("Customer capability status updated", { accountId });
        // TODO: Handle as needed for your subscription billing logic
        break;
      }

      default:
        log("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
