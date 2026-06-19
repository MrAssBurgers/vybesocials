/** Canonical continue URL for Firebase password reset emails. */
export function passwordResetContinueUrl(): string {
  const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
  return `${base.replace(/\/$/, '')}/reset-password`;
}

/** Turn Admin generatePasswordResetLink output into a clean vybehub.app link for branded email. */
export function toCleanPasswordResetLink(firebaseLink: string): string {
  try {
    const parsed = new URL(firebaseLink);
    const oobCode = parsed.searchParams.get('oobCode');
    if (!oobCode) return firebaseLink;

    const clean = new URL(passwordResetContinueUrl());
    clean.searchParams.set('oobCode', oobCode);
    clean.searchParams.set('mode', 'resetPassword');
    return clean.toString();
  } catch {
    return firebaseLink;
  }
}
