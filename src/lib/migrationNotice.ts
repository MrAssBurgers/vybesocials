/** Local dismiss state for the Firebase migration account notice. */
export const MIGRATION_NOTICE_STORAGE_KEY = 'vybe-migration-notice-v1';

export const MIGRATION_NOTICE_TITLE = 'VYBE was upgraded';

export const MIGRATION_NOTICE_BODY =
  'We moved to a new platform. Your posts, DMs, and profile are safe. Email users: tap Forgot password once to set a new password. Google or Apple sign-in works as before.';

/**
 * Accounts created on/after this instant are treated as native Firebase signups.
 * Only older accounts (or auth-page login help) should see the migration banner.
 */
export const MIGRATION_NOTICE_CUTOFF_ISO = '2026-06-15T00:00:00.000Z';

export function isMigrationNoticeEnabled(): boolean {
  return import.meta.env.VITE_MIGRATION_NOTICE !== 'false';
}

export function isMigrationNoticeDismissed(): boolean {
  try {
    return localStorage.getItem(MIGRATION_NOTICE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissMigrationNotice(): void {
  try {
    localStorage.setItem(MIGRATION_NOTICE_STORAGE_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

export function isLegacyMigrationAccount(accountCreatedAt?: string | null): boolean {
  if (!accountCreatedAt) return false;
  const created = Date.parse(accountCreatedAt);
  if (!Number.isFinite(created)) return false;
  return created < Date.parse(MIGRATION_NOTICE_CUTOFF_ISO);
}

/**
 * @param accountCreatedAt Profile created_at — required for in-app notice.
 * @param opts.authSurface When true (login screen), show until dismissed without a profile gate
 *   so migrated email users still see password-reset guidance before sign-in.
 */
export function shouldShowMigrationNotice(
  accountCreatedAt?: string | null,
  opts?: { authSurface?: boolean },
): boolean {
  if (!isMigrationNoticeEnabled() || isMigrationNoticeDismissed()) return false;
  if (opts?.authSurface) return true;
  return isLegacyMigrationAccount(accountCreatedAt);
}
