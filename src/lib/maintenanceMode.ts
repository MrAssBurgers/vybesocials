/** Full-app maintenance gate — set VITE_MAINTENANCE_MODE=true in Lovable env + Publish. */
export function isMaintenanceMode(): boolean {
  const raw = import.meta.env.VITE_MAINTENANCE_MODE;
  return raw === 'true' || raw === '1';
}

export function getMaintenanceMessage(): string {
  const custom = import.meta.env.VITE_MAINTENANCE_MESSAGE;
  if (typeof custom === 'string' && custom.trim()) return custom.trim();
  return 'VYBE is down for reconstruction while we move to our new backend. Sign-ups, messages, and posts are paused. We will be back soon.';
}
