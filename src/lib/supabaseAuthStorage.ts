/**
 * Supabase auth storage with a mirrored backup key.
 * Despia WebViews occasionally drop a single localStorage write on hard kill;
 * the backup prevents "logged out on reopen" when the primary key vanishes.
 */

const BACKUP_SUFFIX = '-vybe-backup';

export const supabaseAuthStorage = {
  getItem(key: string): string | null {
    try {
      const primary = localStorage.getItem(key);
      if (primary) return primary;
      return localStorage.getItem(`${key}${BACKUP_SUFFIX}`);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
      localStorage.setItem(`${key}${BACKUP_SUFFIX}`, value);
    } catch {
      /* private mode / quota */
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}${BACKUP_SUFFIX}`);
    } catch {
      /* ignore */
    }
  },
};
