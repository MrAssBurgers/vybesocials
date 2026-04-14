

## Switch Subscriptions to Live Mode with Lovable Payments

Your project already has a custom Stripe integration with test-mode keys. To go live with Lovable's built-in Stripe payments, here's what needs to happen:

### Step 1: Enable Lovable's Built-in Stripe Integration
Call the `enable_stripe_payments` tool to set up Lovable's managed Stripe integration. This gives you a proper Stripe account connected through Lovable — no need to manage secret keys manually.

### Step 2: Create Live Products & Prices
Once Stripe is enabled through Lovable, create the VYBE Premium subscription product with a live price using Stripe tools. This replaces the current test price ID (`price_1TCQhFCvnv9K2bAQeButRL6m`).

### Step 3: Update Edge Functions
- **`create-premium-checkout/index.ts`**: Replace the hardcoded `PREMIUM_PRICES` with the new live price ID from the Lovable-managed Stripe account
- **`check-premium-subscription/index.ts`**: No changes needed — it already reads `STRIPE_SECRET_KEY` dynamically
- **`_shared/stripe-key.ts`**: No changes needed — it resolves keys from environment

### Step 4: Update Stripe Config
Update the `stripe_config` table to set `stripe_mode` to `live` and store the correct live publishable key.

### What This Means
- Test mode checkout sessions will be replaced with real payment processing
- Users will be charged real money for VYBE Premium
- The same subscription flow (checkout → verify → entitlement) stays intact
- RevenueCat integration remains