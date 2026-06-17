/** Canonical continue URL for Firebase password reset emails. */
export function passwordResetContinueUrl(): string {
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  return `${base.replace(/\/$/, '')}/reset-password`;
}
