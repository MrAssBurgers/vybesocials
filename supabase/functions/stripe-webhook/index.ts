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
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

async function getWebhookSecret(): Promise<string> {
  // Try env var first
  const envSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (envSecret && envSecret.length > 0) return envSecret;

  // Fallback to app_secrets
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );
  const { data } = await adminClient
    .from("app_secrets")
    .select("value")
    .eq("key", "STRIPE_WEBHOOK_SECRET")
    .maybeSingle();

  if (data?.value) return data.value;
  throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = await getStripeSecretKey();
    const keyCheck = validateStripeKey(stripeKey);
    if (!keyCheck.valid) throw new Error(keyCheck.error!);

    const webhookSecret = await getWebhookSecret();
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("No stripe-signature header");

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logStep("Signature verification failed", { message: msg });
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${msg}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    logStep("Event verified", { type: event.type, id: event.id });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const customerId = session.customer as string;

        if (userId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              is_premium: true,
              stripe_customer_id: customerId,
            })
            .eq("id", userId);
          logStep("Premium activated via checkout", { userId, customerId });
        } else if (session.customer_email) {
          // Fallback: find user by email
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", session.customer_email)
            .maybeSingle();
          if (profile) {
            await supabaseAdmin
              .from("profiles")
              .update({
                is_premium: true,
                stripe_customer_id: customerId,
              })
              .eq("id", profile.id);
            logStep("Premium activated via email lookup", { profileId: profile.id });
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;

        if (customerId && periodEnd) {
          const expiresAt = new Date(periodEnd * 1000).toISOString();
          await supabaseAdmin
            .from("profiles")
            .update({
              is_premium: true,
              premium_expires_at: expiresAt,
            })
            .eq("stripe_customer_id", customerId);
          logStep("Premium extended", { customerId, expiresAt });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await supabaseAdmin
          .from("profiles")
          .update({
            is_premium: false,
            premium_expires_at: null,
          })
          .eq("stripe_customer_id", customerId);
        logStep("Premium cancelled", { customerId });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
