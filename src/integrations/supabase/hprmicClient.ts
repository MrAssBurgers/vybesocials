import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import {
  NEW_WRITES_PUBLISHABLE_KEY,
  NEW_WRITES_SUPABASE_URL,
} from '@/lib/canonicalSupabase';

const HPRMIC_AUTH_KEY = 'sb-hprmicwhlaaqfgshucec-auth-token';
const BACKUP_SUFFIX = '-vybe-backup';

/** Isolated auth storage for hprmic — never mixed with agtcyx primary session. */
const hprmicAuthStorage = {
  getItem(key: string): string | null {
    try {
      if (key !== HPRMIC_AUTH_KEY) return null;
      return (
        localStorage.getItem(HPRMIC_AUTH_KEY) ||
        localStorage.getItem(`${HPRMIC_AUTH_KEY}${BACKUP_SUFFIX}`)
      );
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (key !== HPRMIC_AUTH_KEY) return;
      localStorage.setItem(HPRMIC_AUTH_KEY, value);
      localStorage.setItem(`${HPRMIC_AUTH_KEY}${BACKUP_SUFFIX}`, value);
    } catch {
      /* quota / private mode */
    }
  },
  removeItem(key: string): void {
    try {
      if (key !== HPRMIC_AUTH_KEY) return;
      localStorage.removeItem(HPRMIC_AUTH_KEY);
      localStorage.removeItem(`${HPRMIC_AUTH_KEY}${BACKUP_SUFFIX}`);
    } catch {
      /* ignore */
    }
  },
};

export const hprmicSupabase = createClient<Database>(
  NEW_WRITES_SUPABASE_URL,
  NEW_WRITES_PUBLISHABLE_KEY,
  {
    auth: {
      storage: hprmicAuthStorage,
      storageKey: HPRMIC_AUTH_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);
