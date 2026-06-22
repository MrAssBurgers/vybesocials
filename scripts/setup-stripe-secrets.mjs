#!/usr/bin/env node
/**
 * Upload Stripe secrets to Firebase Secret Manager and deploy Stripe Cloud Functions.
 *
 *   STRIPE_SECRET_KEY=sk_live_... npm run setup:stripe-secrets
 *   npm run setup:stripe-secrets -- --key=sk_live_...
 *   npm run setup:stripe-secrets -- --deploy-only
 *
 * Optional:
 *   STRIPE_PUBLISHABLE_KEY=pk_live_...  (upserts Firestore stripe_config)
 *   STRIPE_WEBHOOK_SECRET=whsec_...     (skip auto webhook create)
 *   PUBLIC_SITE_URL=https://vybehub.app
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';
const REGION = process.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';

const STRIPE_FUNCTIONS = [
  'validateStripeConfig',
  'connectV2CreateAccount',
  'connectV2AccountLink',
  'connectV2AccountStatus',
  'connectV2BillingPortal',
  'connectV2Checkout',
  'connectV2Subscription',
  'connectV2CreateProduct',
  'connectV2ListProducts',
  'createStripeDashboardLink',
  'createTip',
  'processCreatorPayout',
  'checkStripeConnect',
  'createStripeConnect',
  'stripeWebhook',
  'connectV2WebhookSubscriptions',
  'connectV2WebhookThin',
];

const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'account.updated',
  'capability.updated',
];

function loadEnvFile() {
  const env = {};
  if (!existsSync('.env')) return env;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function parseArgs(argv) {
  let key = null;
  let deployOnly = false;
  let skipWebhooks = false;
  for (const arg of argv) {
    const km = arg.match(/^--key=(.+)$/);
    if (km) key = km[1];
    if (arg === '--deploy-only') deployOnly = true;
    if (arg === '--skip-webhooks') skipWebhooks = true;
  }
  return { key, deployOnly, skipWebhooks };
}

function runFirebase(args, input) {
  const result = spawnSync('npx', ['-y', 'firebase-tools@latest', ...args, '--project', PROJECT], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function setSecret(name, value) {
  console.log(`Setting secret ${name}…`);
  runFirebase(['functions:secrets:set', name, '--force'], value);
}

function webhookUrl(functionName) {
  return `https://${REGION}-${PROJECT}.cloudfunctions.net/${functionName}`;
}

async function ensureWebhookSecrets(stripe, providedWebhook, providedThin) {
  if (providedWebhook && providedThin) {
    return { webhookSecret: providedWebhook, thinSecret: providedThin };
  }

  const mainUrl = webhookUrl('stripeWebhook');
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  let main = existing.data.find((e) => e.url === mainUrl && e.status !== 'disabled');

  if (!main) {
    console.log(`Creating Stripe webhook → ${mainUrl}`);
    main = await stripe.webhookEndpoints.create({
      url: mainUrl,
      enabled_events: WEBHOOK_EVENTS,
      description: 'VYBE Firebase — checkout + subscriptions',
    });
  } else {
    console.log(`Stripe webhook already exists: ${mainUrl}`);
  }

  const webhookSecret = providedWebhook || main.secret;
  if (!webhookSecret) {
    console.warn(
      'Could not read webhook signing secret (existing endpoint). Set STRIPE_WEBHOOK_SECRET=whsec_... and re-run.',
    );
  }

  const thinUrl = webhookUrl('connectV2WebhookThin');
  let thin = existing.data.find((e) => e.url === thinUrl && e.status !== 'disabled');
  if (!thin && !providedThin) {
    console.log(`Creating thin webhook → ${thinUrl}`);
    try {
      thin = await stripe.webhookEndpoints.create({
        url: thinUrl,
        enabled_events: ['account.updated', 'capability.updated'],
        description: 'VYBE Firebase — Connect thin events',
      });
    } catch (err) {
      console.warn('Thin webhook create skipped:', err?.message || err);
    }
  }

  const thinSecret = providedThin || thin?.secret || webhookSecret;
  return { webhookSecret, thinSecret };
}

async function upsertStripeConfig(publishableKey, mode) {
  if (!publishableKey) return;
  try {
    const adminPath = './scripts/migrate-firebase/_adminInit.mjs';
    if (!existsSync(adminPath)) return;
    const { initFirebaseAdmin } = await import(adminPath);
    const { getFirestore } = await import('firebase-admin/firestore');
    initFirebaseAdmin();
    const db = getFirestore();
    const snap = await db.collection('stripe_config').limit(1).get();
    const payload = {
      stripe_enabled: true,
      stripe_mode: mode,
      stripe_publishable_key: publishableKey,
      updated_at: new Date().toISOString(),
    };
    if (snap.empty) {
      await db.collection('stripe_config').add({
        ...payload,
        created_at: new Date().toISOString(),
      });
    } else {
      await snap.docs[0].ref.set(payload, { merge: true });
    }
    console.log('Firestore stripe_config updated (enabled, live mode).');
  } catch (err) {
    console.warn('Firestore stripe_config update skipped:', err?.message || err);
  }
}

async function main() {
  const fromArgs = parseArgs(process.argv.slice(2));
  const fromFile = loadEnvFile();
  const secretKey =
    fromArgs.key ||
    process.env.STRIPE_SECRET_KEY ||
    fromFile.STRIPE_SECRET_KEY;
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY || fromFile.STRIPE_PUBLISHABLE_KEY || null;
  const siteUrl = process.env.PUBLIC_SITE_URL || fromFile.PUBLIC_SITE_URL || 'https://vybehub.app';
  const providedWebhook =
    process.env.STRIPE_WEBHOOK_SECRET || fromFile.STRIPE_WEBHOOK_SECRET || null;
  const providedThin =
    process.env.STRIPE_WEBHOOK_SECRET_THIN || fromFile.STRIPE_WEBHOOK_SECRET_THIN || null;

  if (!fromArgs.deployOnly && !secretKey) {
    console.error(`
Missing STRIPE_SECRET_KEY. Use any ONE of:

  STRIPE_SECRET_KEY=sk_live_... npm run setup:stripe-secrets
  npm run setup:stripe-secrets -- --key=sk_live_...
  Add STRIPE_SECRET_KEY to .env (never commit), then npm run setup:stripe-secrets

Optional: STRIPE_PUBLISHABLE_KEY=pk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
`);
    process.exit(1);
  }

  let mode = 'live';
  if (!fromArgs.deployOnly) {
    const Stripe = require('../functions/node_modules/stripe').default;
    const stripe = new Stripe(secretKey, { apiVersion: '2024-12-18.acacia' });
    const acct = await stripe.accounts.retrieve();
    mode = secretKey.startsWith('sk_live_') ? 'live' : 'test';
    console.log(`Stripe account verified: ${acct.id} (${mode} mode)`);

    setSecret('STRIPE_SECRET_KEY', secretKey);
    setSecret('PUBLIC_SITE_URL', siteUrl);

    if (!fromArgs.skipWebhooks) {
      const { webhookSecret, thinSecret } = await ensureWebhookSecrets(
        stripe,
        providedWebhook,
        providedThin,
      );
      if (webhookSecret) setSecret('STRIPE_WEBHOOK_SECRET', webhookSecret);
      if (thinSecret) setSecret('STRIPE_WEBHOOK_SECRET_THIN', thinSecret);
    } else if (providedWebhook && providedThin) {
      setSecret('STRIPE_WEBHOOK_SECRET', providedWebhook);
      setSecret('STRIPE_WEBHOOK_SECRET_THIN', providedThin);
    } else {
      console.warn('Skipping webhooks — set STRIPE_WEBHOOK_SECRET manually before checkout works.');
    }

    await upsertStripeConfig(publishableKey, mode);
  }

  console.log('\nBuilding Cloud Functions…');
  const build = spawnSync('npm', ['run', 'build'], { cwd: 'functions', stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);

  const fnList = STRIPE_FUNCTIONS.map((f) => `functions:${f}`).join(',');
  console.log('\nDeploying Stripe Cloud Functions…');
  runFirebase(['deploy', '--only', fnList], undefined);

  console.log(`
Done.

Stripe Dashboard checklist:
  • Webhook URL: ${webhookUrl('stripeWebhook')}
  • Thin webhook: ${webhookUrl('connectV2WebhookThin')}
  • Add pk_live publishable key in Admin → Settings → Stripe (if not set via STRIPE_PUBLISHABLE_KEY)
  • Lovable Publish → test creator Connect + checkout

Security: rotate STRIPE_SECRET_KEY if it was ever pasted in chat or committed.
`);
}

main().catch((err) => {
  console.error('setup-stripe-secrets failed:', err?.message || err);
  process.exit(1);
});
