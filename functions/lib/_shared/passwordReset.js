/** Canonical continue URL for Firebase password reset emails. */
export function passwordResetContinueUrl() {
    const base = process.env.PUBLIC_SITE_URL || 'https://vybehub.app';
    return `${base.replace(/\/$/, '')}/reset-password`;
}
//# sourceMappingURL=passwordReset.js.map