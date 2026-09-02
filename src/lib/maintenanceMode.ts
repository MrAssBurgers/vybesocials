import { shouldBypassMaintenanceForHost } from '@/lib/previewSandbox';

declare global {
  interface Window {
    __VYBE_MAINTENANCE__?: boolean;
  }
}

export function dismissStaticMaintenanceShell(): void {
  if (typeof document === 'undefined') return;
  document.getElementById('vybe-maintenance-static')?.remove();
  document.documentElement.removeAttribute('data-vybe-maintenance');
  if (typeof window !== 'undefined') {
    window.__VYBE_MAINTENANCE__ = false;
  }
}

/**
 * Full-app maintenance gate.
 *
 * An explicit build setting is authoritative. This lets a fresh production
 * bundle recover from an older cached index.html that still carries
 * data-vybe-maintenance="true", while preserving the supported emergency flow:
 * set VITE_MAINTENANCE_MODE=true and publish a new build.
 */
export function isMaintenanceMode(): boolean {
  if (shouldBypassMaintenanceForHost()) {
    dismissStaticMaintenanceShell();
    return false;
  }

  const raw = import.meta.env.VITE_MAINTENANCE_MODE;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') {
    // A current build explicitly marked healthy must remove any stale static
    // overlay before React paints; otherwise cached HTML can cover the app.
    dismissStaticMaintenanceShell();
    return false;
  }

  if (typeof document !== 'undefined') {
    if (document.documentElement.getAttribute('data-vybe-maintenance') === 'true') return true;
  }
  if (typeof window !== 'undefined' && window.__VYBE_MAINTENANCE__ === true) return true;
  return false;
}

export function getMaintenanceMessage(): string {
  const custom = import.meta.env.VITE_MAINTENANCE_MESSAGE;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return 'VYBE is temporarily unavailable while maintenance is completed. Please check back soon.';
}
