import { despiaCall, isDespiaRuntime } from '@/lib/despiaBridge';

const DESPIA_BADGE_SCHEMES = [
  (count: number) => `setappbadge://${count}`,
  (count: number) => `appbadge://${count}`,
  (count: number) => `setbadge://${count}`,
];

/**
 * Sync home-screen / dock icon badge count (web Badge API + Despia native attempt).
 */
export async function setAppIconBadge(count: number): Promise<void> {
  const safeCount = Math.max(0, Math.floor(count));

  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      if (safeCount > 0) {
        await navigator.setAppBadge(safeCount);
      } else if ('clearAppBadge' in navigator) {
        await navigator.clearAppBadge();
      }
    } catch {
      /* Badge API optional */
    }
  }

  if (!isDespiaRuntime()) return;

  for (const scheme of DESPIA_BADGE_SCHEMES) {
    void despiaCall(scheme(safeCount), [], 800);
  }
}
