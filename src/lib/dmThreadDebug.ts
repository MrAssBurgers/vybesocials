/**
 * Dev timing / cancel logs for DM thread open (recording-driven hang fix).
 * Enable with localStorage vybe-dm-thread-debug=1 or DEV builds.
 */
const FLAG = 'vybe-dm-thread-debug';

function enabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(FLAG) === '1') return true;
  } catch {
    /* ignore */
  }
  return Boolean(import.meta.env.DEV);
}

export function dmThreadLog(
  event: string,
  conversationId: string | undefined | null,
  extra?: Record<string, unknown>,
): void {
  if (!enabled()) return;
  console.info('[dm-thread]', {
    event,
    conversationId: conversationId ?? null,
    t: performance.now(),
    ...extra,
  });
}
