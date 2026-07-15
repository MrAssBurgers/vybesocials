/**
 * Lightweight startup phase logger for Safari / Xcode WKWebView consoles.
 * Prefixed + timed so the last line before a freeze is unambiguous.
 */

import { getRuntimeOs, isNativeAppShell, stampRuntimeOsOnDocument } from '@/lib/despiaBridge';

const t0 =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

let lastPhase = '';
let lastAt = t0;
let stamped = false;

function ensureOsStamp(): void {
  if (stamped || typeof document === 'undefined') return;
  stampRuntimeOsOnDocument();
  stamped = true;
}

export function logStartupPhase(phase: string, detail?: Record<string, unknown>): void {
  ensureOsStamp();
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const totalMs = Math.round(now - t0);
  const deltaMs = Math.round(now - lastAt);
  lastPhase = phase;
  lastAt = now;

  const base = {
    os: getRuntimeOs(),
    shell: isNativeAppShell() ? 'native' : 'web',
    ...(detail || {}),
  };
  console.log(
    `[VYBE:startup +${totalMs}ms Δ${deltaMs}ms os=${base.os} shell=${base.shell}] ${phase} ${JSON.stringify(base)}`,
  );
}

export function getLastStartupPhase(): string {
  return lastPhase;
}

export function getStartupElapsedMs(): number {
  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  return Math.round(now - t0);
}
