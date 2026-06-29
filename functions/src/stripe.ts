/**
 * Stripe Connect V2 + checkout/tip/payout suite.
 * Uses dynamic import to keep cold start low. Secrets: STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_THIN.
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, requireAdmin } from './_shared/admin.js';

const STRIPE_SECRETS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_WEBHOOK_SECRET_THIN'];

async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY not configured');
  const mod: any = await import('stripe' as string).catch(() => null);
  if (!mod) throw new HttpsError('failed-precondition', 'stripe package not installed');
  const Stripe = mod.default || mod;
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' });
}

async function getCreatorAccountId(uid: string): Promise<string | null> {
  const snap = await db.collection('creator_profiles').where('user_id', '==', uid).limit(1).get();
  if (snap.empty) return null;
  return (snap.docs[0].data() as any).stripe_account_id || null;
}

export const validateStripeConfig = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  await requireAdmin(request);
  try {
    const stripe = await getStripe();
    const acct = await stripe.accounts.list({ limit: 1 });
    return { ok: true, mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test', accounts: acct.data.length };
  } catch (err: any) {
    return { ok: false, error: err?.message };
  }
});

// ===== Connect V2 (Stripe Connect Embedded / accounts v2) =====
export const connectV2CreateAccount = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const { email, country } = (request.data || {}) as any;
  const account = await stripe.accounts.create({
    type: 'express',
    country: country || 'US',
    email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { uid },
  });
  await db.collection('creator_profiles').doc(uid).set({
    user_id: uid, stripe_account_id: account.id, updated_at: new Date().toISOString(),
  }, { merge: true });
  return { ok: true, account_id: account.id };
});

export const connectV2AccountLink = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const accountId = await getCreatorAccountId(uid);
  if (!accountId) throw new HttpsError('failed-precondition', 'No Stripe account — call createAccount first');
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/creator/onboarding?refresh=1`,
    return_url: `${base}/creator/onboarding?done=1`,
    type: 'account_onboarding',
  });
  return { ok: true, url: link.url };
});

export const connectV2AccountStatus = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const accountId = await getCreatorAccountId(uid);
  if (!accountId) return { ok: true, status: 'none' };
  const acct = await stripe.accounts.retrieve(accountId);
  return {
    ok: true,
    status: acct.details_submitted ? 'active' : 'pending',
    charges_enabled: acct.charges_enabled,
    payouts_enabled: acct.payouts_enabled,
    requirements: acct.requirements,
  };
});

export const connectV2BillingPortal = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const profile = await db.collection('profiles').doc(uid).get();
  const customerId = (profile.data() as any)?.stripe_customer_id;
  if (!customerId) throw new HttpsError('failed-precondition', 'No Stripe customer');
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${base}/settings/billing` });
  return { ok: true, url: session.url };
});

function safeRedirectPath(input: unknown, fallback: string): string {
  const s = String(input ?? '').trim();
  // Only accept same-site relative paths like /checkout/success. Reject //, schemes, backslashes.
  if (!s) return fallback;
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /^[a-z]+:/i.test(s)) {
    return fallback;
  }
  return s.slice(0, 512);
}

export const connectV2Checkout = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const { price_id, quantity, mode, creator_account_id, success_path, cancel_path, application_fee_percent } = (request.data || {}) as any;
  if (!price_id) throw new HttpsError('invalid-argument', 'price_id required');
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  const successPath = safeRedirectPath(success_path, '/checkout/success?session_id={CHECKOUT_SESSION_ID}');
  const cancelPath = safeRedirectPath(cancel_path, '/checkout/cancel');
  const params: any = {
    mode: mode || 'payment',
    line_items: [{ price: price_id, quantity: quantity || 1 }],
    success_url: `${base}${successPath}`,
    cancel_url: `${base}${cancelPath}`,
    metadata: { uid },
  };
  if (creator_account_id) {
    params.payment_intent_data = {
      application_fee_amount: undefined,
      transfer_data: { destination: creator_account_id },
    };
    if (application_fee_percent) params.payment_intent_data.application_fee_percent = application_fee_percent;
  }
  const session = await stripe.checkout.sessions.create(params);
  return { ok: true, url: session.url, session_id: session.id };
});

export const connectV2Subscription = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const { price_id, creator_account_id, success_path, cancel_path } = (request.data || {}) as any;
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  const successPath = safeRedirectPath(success_path, '/subscribe/success?session_id={CHECKOUT_SESSION_ID}');
  const cancelPath = safeRedirectPath(cancel_path, '/subscribe/cancel');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: price_id, quantity: 1 }],
    success_url: `${base}${successPath}`,
    cancel_url: `${base}${cancelPath}`,
    metadata: { uid, creator_account_id: creator_account_id || '' },
  });
  return { ok: true, url: session.url, session_id: session.id };
});


export const connectV2CreateProduct = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const accountId = await getCreatorAccountId(uid);
  if (!accountId) throw new HttpsError('failed-precondition', 'No Stripe account');
  const { name, description, amount, currency, interval } = (request.data || {}) as any;
  const product = await stripe.products.create({ name, description }, { stripeAccount: accountId });
  const price = await stripe.prices.create(
    { product: product.id, unit_amount: amount, currency: currency || 'usd', recurring: interval ? { interval } : undefined },
    { stripeAccount: accountId },
  );
  return { ok: true, product_id: product.id, price_id: price.id };
});

export const connectV2ListProducts = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const accountId = await getCreatorAccountId(uid);
  if (!accountId) return { ok: true, products: [] };
  const products = await stripe.products.list({ limit: 50 }, { stripeAccount: accountId });
  return { ok: true, products: products.data };
});

// ===== Legacy create/check (kept for backwards compat) =====
export const checkCreatorConnect = connectV2AccountStatus;
export const checkStripeConnect = connectV2AccountStatus;
export const createCreatorConnect = connectV2CreateAccount;
export const createStripeConnect = connectV2CreateAccount;
export const createCheckoutSession = connectV2Checkout;
export const createBusinessCheckout = connectV2Checkout;
export const createPremiumCheckout = connectV2Subscription;

export const createStripeDashboardLink = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const accountId = await getCreatorAccountId(uid);
  if (!accountId) throw new HttpsError('failed-precondition', 'No Stripe account');
  const link = await stripe.accounts.createLoginLink(accountId);
  return { ok: true, url: link.url };
});

export const createTip = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const stripe = await getStripe();
  const { creator_user_id, amount, message } = (request.data || {}) as any;
  if (!creator_user_id || !amount) throw new HttpsError('invalid-argument', 'creator_user_id and amount required');
  const accountId = await getCreatorAccountId(creator_user_id);
  if (!accountId) throw new HttpsError('failed-precondition', 'Creator has no Stripe account');
  const platformFee = Math.round(amount * 0.15);
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: { currency: 'usd', unit_amount: amount, product_data: { name: 'Tip' } },
      quantity: 1,
    }],
    payment_intent_data: { application_fee_amount: platformFee, transfer_data: { destination: accountId } },
    success_url: `${base}/tip/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/`,
    metadata: { uid, creator_user_id, message: message || '' },
  });
  await db.collection('tips').add({
    sender_id: uid, recipient_id: creator_user_id, amount, message: message || '',
    status: 'pending', session_id: session.id, created_at: new Date().toISOString(),
  });
  return { ok: true, url: session.url };
});

export const processCreatorPayout = onCall({ secrets: STRIPE_SECRETS }, async (request) => {
  await requireAdmin(request);
  const stripe = await getStripe();
  const { creator_user_id, amount, currency } = (request.data || {}) as any;
  const accountId = await getCreatorAccountId(creator_user_id);
  if (!accountId) throw new HttpsError('failed-precondition', 'No account');
  const payout = await stripe.payouts.create({ amount, currency: currency || 'usd' }, { stripeAccount: accountId });
  await db.collection('creator_payouts').add({
    creator_user_id, amount, currency: currency || 'usd', status: payout.status,
    stripe_payout_id: payout.id, created_at: new Date().toISOString(),
  });
  return { ok: true, payout_id: payout.id };
});

// ===== Webhooks =====
async function handleWebhook(req: any, res: any, secretEnvName: string) {
  const stripe = await getStripe();
  const sig = req.headers['stripe-signature'];
  const secret = process.env[secretEnvName];
  if (!secret) { res.status(500).send('webhook secret missing'); return; }
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig as string, secret);
  } catch (err: any) {
    res.status(400).send(`Webhook signature invalid: ${err.message}`);
    return;
  }
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await db.collection('orders').add({
          stripe_session_id: session.id, amount: session.amount_total, currency: session.currency,
          status: 'completed', uid: session.metadata?.uid, created_at: new Date().toISOString(),
        });
        if (session.metadata?.creator_user_id) {
          await db.collection('creator_earnings').add({
            creator_user_id: session.metadata.creator_user_id, amount: session.amount_total,
            type: 'sale', source_session: session.id, created_at: new Date().toISOString(),
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const profileSnap = await db.collection('profiles').where('stripe_customer_id', '==', customerId).limit(1).get();
        if (!profileSnap.empty) {
          await profileSnap.docs[0].ref.update({
            premium_status: sub.status === 'active' ? 'active' : 'inactive',
            premium_expires_at: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          });
        }
        break;
      }
    }
  } catch (err: any) {
    console.error('webhook handler error', err);
  }
  res.status(200).json({ received: true });
}

export const stripeWebhook = onRequest({ secrets: STRIPE_SECRETS }, (req, res) => handleWebhook(req, res, 'STRIPE_WEBHOOK_SECRET'));
export const connectV2WebhookSubscriptions = onRequest({ secrets: STRIPE_SECRETS }, (req, res) => handleWebhook(req, res, 'STRIPE_WEBHOOK_SECRET'));
export const connectV2WebhookThin = onRequest({ secrets: STRIPE_SECRETS }, (req, res) => handleWebhook(req, res, 'STRIPE_WEBHOOK_SECRET_THIN'));
