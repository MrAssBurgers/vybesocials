/**
 * Despia offline (local) push helper.
 * Schedules a notification on the device after `delaySeconds`. Fires even if
 * the app is closed. No-op outside the Despia native shell.
 */

import { isDespiaRuntime } from '@/lib/despiaBridge';

export function isNativeShell(): boolean {
  return isDespiaRuntime();
}

export interface OfflinePushOptions {
  delaySeconds: number;
  title: string;
  body: string;
  url?: string;
}

function buildLocalPushScheme(opts: OfflinePushOptions): string {
  const delay = Math.max(0, Math.floor(opts.delaySeconds));
  const t = encodeURIComponent(opts.title);
  const b = encodeURIComponent(opts.body);
  const u = encodeURIComponent(opts.url || (typeof window !== 'undefined' ? window.location.origin : ''));
  return `sendlocalpushmsg://push.send?s=${delay}=msg!${b}&!#${t}&!#${u}`;
}

/** Instant on-device notification (delay 0) — useful for "test push" in Settings. */
export function sendInstantLocalPush(
  title: string,
  body: string,
  url?: string,
): boolean {
  return scheduleOfflinePush({ delaySeconds: 0, title, body, url });
}

export function scheduleOfflinePush(opts: OfflinePushOptions): boolean {
  if (!isDespiaRuntime()) return false;
  const scheme = buildLocalPushScheme(opts);
  try {
    void import('despia-native').then((mod) => {
      const despia = (mod as { default?: (url: string) => void }).default ?? mod;
      if (typeof despia === 'function') despia(scheme);
    });
    return true;
  } catch {
    try {
      window.location.href = scheme;
      return true;
    } catch {
      return false;
    }
  }
}
