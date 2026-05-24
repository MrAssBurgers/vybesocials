/**
 * Sentry initialization. DSN is read from VITE_SENTRY_DSN — a publishable
 * client-side key safe to ship in the bundle. When unset (most local/preview
 * builds), Sentry no-ops and the app behaves normally.
 *
 * Wire a DSN in Lovable → Project Settings → Environment Variables:
 *   VITE_SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>
 */
import * as Sentry from '@sentry/react';

let initialized = false;

export function initSentry() {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // Silently no-op when no DSN is configured. Keeps preview clean.
    return;
  }

  const isProd = import.meta.env.PROD;
  const release = (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) || undefined;

  Sentry.init({
    dsn,
    release,
    environment: isProd ? 'production' : 'preview',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Privacy-first: never record text or input by default.
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Performance — sample lightly in prod, fully in preview for debugging.
    tracesSampleRate: isProd ? 0.1 : 1.0,
    // Replay — only on errors in prod, never on sampled sessions (cost control).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: isProd ? 0.25 : 1.0,
    // Drop noisy/preview-only errors before they cost a quota event.
    beforeSend(event, hint) {
      const msg = (hint?.originalException as Error | undefined)?.message || event.message || '';
      if (typeof msg === 'string') {
        if (msg.includes('Can only be used on: https://vybehub.app')) return null;
        if (msg.includes('ResizeObserver loop')) return null;
        if (msg.includes('Non-Error promise rejection captured')) return null;
        if (msg.includes('[WM] No SW registration')) return null;
      }
      return event;
    },
  });
  initialized = true;
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
export const captureException = (err: unknown, context?: Record<string, unknown>) => {
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* never let logging break the app */
  }
};
export const setSentryUser = (user: { id?: string; username?: string } | null) => {
  try {
    Sentry.setUser(user ? { id: user.id, username: user.username } : null);
  } catch {
    /* ignore */
  }
};
