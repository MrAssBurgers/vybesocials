/**
 * Despia offline (local) push helper.
 * Schedules a notification on the device after `delaySeconds`. Fires even if
 * the app is closed. No-op outside the Despia native shell.
 *
 * Use only for short, user-initiated reminders (timers, "remind me later").
 * For server-driven notifications use OneSignal.
 */

const isDespia = typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('despia');

export function isNativeShell(): boolean {
  return isDespia;
}

export interface OfflinePushOptions {
  delaySeconds: number;
  title: string;
  body: string;
  /** Deep-link URL opened in the WebView when the user taps the notification. */
  url?: string;
}

export function scheduleOfflinePush(opts: OfflinePushOptions): boolean {
  if (!isDespia) return false;
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
