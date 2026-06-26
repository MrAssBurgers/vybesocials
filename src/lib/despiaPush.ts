/**
 * Despia offline (local) push helper.
 * Schedules a notification on the device after `delaySeconds`. Fires even if
 * the app is closed. No-op outside the Despia native shell.
 */

import { isDespiaRuntime } from '@/lib/despiaBridge';

type DespiaNativeFn = (url: string) => void;

let despiaNative: DespiaNativeFn | null = null;

if (typeof window !== 'undefined' && isDespiaRuntime()) {
  void import('despia-native').then((mod) => {
    const fn = (mod as { default?: DespiaNativeFn }).default ?? mod;
    if (typeof fn === 'function') despiaNative = fn;
  });
}

function fireScheme(scheme: string): boolean {
  if (!isDespiaRuntime()) return false;
  if (despiaNative) {
    despiaNative(scheme);
    return true;
  }
  try {
    window.location.href = scheme;
    return true;
  } catch {
    void import('despia-native').then((mod) => {
      const fn = (mod as { default?: DespiaNativeFn }).default ?? mod;
      if (typeof fn === 'function') fn(scheme);
    });
    return true;
  }
}

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
  return fireScheme(buildLocalPushScheme(opts));
}
