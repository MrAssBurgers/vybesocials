/**
 * connect-v2-webhook-subscriptions
 * ─────────────────────────────────
 * Handles **standard** (non-thin) webhook events for subscription lifecycle
 * management when connected accounts are billed as subscribers.
 *
 * Events handled:
 *   • customer.subscription.updated  — upgrade, downgrade, pause, cancel-at-period-end
 *   • customer.subscription.deleted  — subscription fully cancelled
 *   • invoice.paid                   — successful renewal
 *
 * SETUP:
 *   1. Stripe Dashboard → Developers → Webhooks → + Add destination
 *   2. Select the events above
 *   3. Set URL to: https://<project>.supabase.co/functions/v1/connect-v2-webhook-subscriptions
 *   4. Copy the signing secret and set CONNECT_SUB_WEBHOOK_SECRET
 *
 * NOTE: These are standard full-payload events, NOT thin events.
 *       For V2 account thin events, see connect-v2-webhook-thin.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@20.4.1";
import { getStripeSecretKey, validateStripeKey } from "../_shared/stripe-key.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const log = (step: string, details?: unknown) =>
  console.log(`[CONNECT-V2-SUB-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });

  try {
    log("Webhook received");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    // ─── PLACEHOLDER ───────────────────────────────────────────────────
    // Set this via Lovable Cloud secrets or Supabase dashboard env vars.
    const webhookSecret = Deno.env.get("CONNECT_SUB_WEBHOOK_SECRET") || "";
    if (!webhookSecret) {
      throw new Error(
        "CONNECT_SUB_WEBHOOK_SECRET is not configured. " +
        "Create a subscription webhook in Stripe Dashboard and set the signing secret.",
      );
    }

    const stripeClient = new Stripe(stripeKey);

    // ── Verify the webhook signature ───────────────────────────────────
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new Error("Missing stripe-signature header");

    const event = await stripeClient.webhooks.constructEventAsync(body, sig, webhookSecret);
    log("Event verified", { type: event.type, id: event.id });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    switch (event.type) {
      // ── Subscription updated ─────────────────────────────────────────
      // Covers: upgrades, downgrades, quantity changes, pause/resume,
      //         and cancel_at_period_end toggling.
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        // For V2 accounts, the subscriber is identified by customer_account
        // which has the shape acct_xxx (NOT cus_xxx).
        const accountId = (subscription as any).customer_account;
        const priceId = subscription.items.data[0]?.price?.id;
        const status = subscription.status;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;

        log("Subscription updated", { accountId, priceId, status, cancelAtPeriodEnd });

        // TODO: Update your database with the new subscription state.
        // Example:
        // await supabaseAdmin.from("business_subscriptions")
        //   .update({
        //     status,
        //     tier_price_id: priceId,
        //     cancel_at_period_end: cancelAtPeriodEnd,
        //   })
        //   .eq("stripe_account_id", accountId);

        if (subscription.pause_collection) {
          log("Subscription is paused", {
            resumesAt: subscription.pause_collection.resumes_at,
            behavior: subscription.pause_collection.behavior,
          });
        }
        break;
      }

      // ── Subscription deleted (fully cancelled) ───────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const accountId = (subscription as any).customer_account;

        log("Subscription cancelled", { accountId });

        // TODO: Revoke access for this connected account.
        // await supabaseAdmin.from("business_subscriptions")
        //   .update({ status: "cancelled" })
        //   .eq("stripe_account_id", accountId);
        break;
      }

      // ── Invoice paid (successful renewal) ────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const accountId = (invoice as any).customer_account;
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;

        log("Invoice paid", { accountId, periodEnd });

        // TODO: Extend access until the next billing period.
        // if (accountId && periodEnd) {
        //   await supabaseAdmin.from("business_subscriptions")
        //     .update({ expires_at: new Date(periodEnd * 1000).toISOString() })
        //     .eq("stripe_account_id", accountId);
        // }
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
