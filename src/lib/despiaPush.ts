/**
 * Despia offline (local) push helper.
 * Schedules a notification on the device after `delaySeconds`. Fires even if
 * the app is closed. No-op outside the Despia native shell.
 *
 * Use only for short, user-initiated reminders (timers, "remind me later").
 * For server-driven notifications use OneSignal.
 */

import { isDespiaRuntime } from '@/lib/despiaBridge';

export function isNativeShell(): boolean {
  return isDespiaRuntime();
}

export interface OfflinePushOptions {
  delaySeconds: number;
  title: string;
  body: string;
  /** Deep-link URL opened in the WebView when the user taps the notification. */
  url?: string;
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
  const delay = Math.max(0, Math.floor(opts.delaySeconds));
  const t = encodeURIComponent(opts.title);
  const b = encodeURIComponent(opts.body);
  const u = encodeURIComponent(opts.url || (typeof window !== 'undefined' ? window.location.origin : ''));
  try {
    (window as any).location.href = `sendlocalpushmsg://push.send?s=${delay}=msg!${b}&!#${t}&!#${u}`;
    return true;
  } catch {
    return false;
  }
}
