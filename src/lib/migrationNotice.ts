/** Local dismiss state for the Firebase migration account notice. */
export const MIGRATION_NOTICE_STORAGE_KEY = 'vybe-migration-notice-v1';

export const MIGRATION_NOTICE_TITLE = 'VYBE was upgraded';

export const MIGRATION_NOTICE_BODY =
  'We moved to a new platform. Your posts, DMs, and profile are safe. Email users: tap Forgot password once to set a new password. Google or Apple sign-in works as before.';

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

export function shouldShowMigrationNotice(): boolean {
  return isMigrationNoticeEnabled() && !isMigrationNoticeDismissed();
}
