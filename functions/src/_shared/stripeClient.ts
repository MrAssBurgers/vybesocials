import { HttpsError } from 'firebase-functions/v2/https';

export async function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY not configured');
  const mod: any = await import('stripe' as string).catch(() => null);
  if (!mod) throw new HttpsError('failed-precondition', 'stripe package not installed');
  const Stripe = mod.default || mod;
  return new Stripe(key, { apiVersion: '2024-12-18.acacia' });
}
