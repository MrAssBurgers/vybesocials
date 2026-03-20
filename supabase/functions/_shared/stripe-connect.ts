export const STALE_BUSINESS_CONNECTION_MESSAGE =
  "Your saved Stripe business account is no longer linked to the current payment platform. Please reconnect Stripe to continue.";

export function isStripeAccountAccessError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("does not have access to account") ||
    normalized.includes("not connected to your platform") ||
    normalized.includes("does not exist") ||
    normalized.includes("no such account")
  );
}

export async function resetBusinessStripeConnection(
  supabaseAdmin: any,
  businessId: string,
) {
  const { error } = await supabaseAdmin
    .from("business_profiles")
    .update({
      stripe_account_id: null,
      stripe_onboarding_complete: false,
    })
    .eq("id", businessId);

  if (error) {
    console.error("[STRIPE-CONNECT] Failed to reset stored business Stripe account", {
      businessId,
      error: error.message,
    });
    return false;
  }

  return true;
}
