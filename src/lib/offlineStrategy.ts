/**
 * Offline delivery strategy for VYBE.
 *
 * - `despia-local` (default): Generates despia/local.json for Despia's on-device
 *   HTTP server (Offline Support → Native). Instant boot after first hydrate.
 * - `pwa`: Service worker caches the app shell on vybehub.app (URL mode only).
 */

export type OfflineMode = 'pwa' | 'despia-local';

export function getOfflineMode(): OfflineMode {
  const raw = import.meta.env.VITE_OFFLINE_MODE as string | undefined;
  return raw === 'pwa' ? 'pwa' : 'despia-local';
}

export function isOfflineModePwa(): boolean {
  return getOfflineMode() === 'pwa';
}

export function isDespiaLocalManifestEnabled(): boolean {
  return getOfflineMode() === 'despia-local';
}
