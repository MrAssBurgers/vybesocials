/**
 * Offline delivery strategy for VYBE.
 *
 * - `pwa` (default): Service worker caches the app shell + assets on vybehub.app.
 *   Despia native apps should load https://vybehub.app directly (URL mode).
 * - `despia-local`: Generates despia/local.json for Despia's on-device HTTP server.
 */

export type OfflineMode = 'pwa' | 'despia-local';

export function getOfflineMode(): OfflineMode {
  const raw = import.meta.env.VITE_OFFLINE_MODE as string | undefined;
  return raw === 'despia-local' ? 'despia-local' : 'pwa';
}

export function isOfflineModePwa(): boolean {
  return getOfflineMode() === 'pwa';
}

export function isDespiaLocalManifestEnabled(): boolean {
  return getOfflineMode() === 'despia-local';
}
