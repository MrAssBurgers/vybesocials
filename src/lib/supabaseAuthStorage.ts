/**
 * Supabase auth storage with a mirrored backup key.
 * Despia WebViews occasionally drop a single localStorage write on hard kill;
 * the backup prevents "logged out on reopen" when the primary key vanishes.
 */

import {
  getSupabaseAuthStorageKey,
  migrateLegacySupabaseAuthStorage,
  sessionMatchesCurrentProject,
} from '@/lib/supabaseStorageKey';

const BACKUP_SUFFIX = '-vybe-backup';

function readPair(key: string): string | null {
  const primary = localStorage.getItem(key);
  if (primary && sessionMatchesCurrentProject(primary)) return primary;

  const backup = localStorage.getItem(`${key}${BACKUP_SUFFIX}`);
  if (backup && sessionMatchesCurrentProject(backup)) {
    if (!primary) localStorage.setItem(key, backup);
    return backup;
  }

  return null;
}

export const supabaseAuthStorage = {
  getItem(key: string): string | null {
    try {
      if (key === getSupabaseAuthStorageKey()) {
        migrateLegacySupabaseAuthStorage();
      }

      const direct = readPair(key);
      if (direct) return direct;

      if (key === getSupabaseAuthStorageKey()) {
        migrateLegacySupabaseAuthStorage();
        return readPair(key);
      }

      return null;
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
