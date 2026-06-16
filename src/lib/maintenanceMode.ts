declare global {
  interface Window {
    __VYBE_MAINTENANCE__?: boolean;
  }
}

/** Full-app maintenance gate — html data-vybe-maintenance, env, or window flag. */
export function isMaintenanceMode(): boolean {
  if (typeof document !== 'undefined') {
    if (document.documentElement.getAttribute('data-vybe-maintenance') === 'true') return true;
  }
  if (typeof window !== 'undefined' && window.__VYBE_MAINTENANCE__ === true) return true;
  const raw = import.meta.env.VITE_MAINTENANCE_MODE;
  return raw === 'true' || raw === '1';
}

export function dismissStaticMaintenanceShell(): void {
  if (typeof document === 'undefined') return;
  document.getElementById('vybe-maintenance-static')?.remove();
  document.documentElement.removeAttribute('data-vybe-maintenance');
}

export function getMaintenanceMessage(): string {
  const custom = import.meta.env.VITE_MAINTENANCE_MESSAGE;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return 'VYBE is down for reconstruction while we move to our new backend. Sign-ups, messages, and posts are paused. We will be back soon.';
}
