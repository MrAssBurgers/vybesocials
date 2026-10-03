/**
 * Shared Stripe Connect onboarding opener — one secure browser sheet at a time.
 * Stripe-hosted onboarding must stay in the system browser (never the app WebView).
 */
import { despiaCall, getRuntimeOs, isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';

const APPROVED_STRIPE_HOST_SUFFIXES = ['.stripe.com'] as const;
const APPROVED_STRIPE_HOSTS = new Set([
  'connect.stripe.com',
  'billing.stripe.com',
  'dashboard.stripe.com',
  'checkout.stripe.com',
  'pay.stripe.com',
]);

let connectFlowOpen = false;
let connectFlowReleaseTimer: number | null = null;

function releaseConnectFlowLock(delayMs = 1500): void {
  if (typeof window === 'undefined') {
    connectFlowOpen = false;
    return;
  }
  if (connectFlowReleaseTimer != null) {
    window.clearTimeout(connectFlowReleaseTimer);
  }
  connectFlowReleaseTimer = window.setTimeout(() => {
    connectFlowOpen = false;
    connectFlowReleaseTimer = null;
  }, delayMs);
}

/** Validate HTTPS Stripe-hosted Account Link / onboarding URLs. */
export function isApprovedStripeConnectUrl(url: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (APPROVED_STRIPE_HOSTS.has(host)) return true;
    return APPROVED_STRIPE_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

export function isStripeConnectFlowOpen(): boolean {
  return connectFlowOpen;
}

/**
 * Open Stripe Connect onboarding in a single secure browser context.
 * Returns false when URL is invalid or a flow is already open.
 */
export async function openStripeConnectFlow(url: string): Promise<boolean> {
  if (!isApprovedStripeConnectUrl(url)) {
    console.warn('[stripe] blocked non-Stripe Connect URL');
    return false;
  }
  if (connectFlowOpen) return false;

  connectFlowOpen = true;

  try {
    if (isDespiaRuntime()) {
      const os = getRuntimeOs();
      if (os === 'ios' || os === 'android') {
        const bridge = `oauth://?url=${encodeURIComponent(url)}`;
        void despiaCall(bridge);
        releaseConnectFlowLock(2500);
        return true;
      }
    }

    if (isNativeAppShell() && getRuntimeOs() !== 'web') {
      window.location.href = url;
      releaseConnectFlowLock(2500);
      return true;
    }

    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      window.location.href = url;
    }
    releaseConnectFlowLock(2000);
    return true;
  } catch (err) {
    connectFlowOpen = false;
    console.warn('[stripe] failed to open Connect flow', err);
    return false;
  }
}

/** Test helper */
export function __resetStripeConnectFlowForTests(): void {
  connectFlowOpen = false;
  if (typeof window !== 'undefined' && connectFlowReleaseTimer != null) {
    window.clearTimeout(connectFlowReleaseTimer);
    connectFlowReleaseTimer = null;
  }
}
