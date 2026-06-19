/**
 * Runs before the Supabase client module initializes so localStorage is
 * repaired/migrated before createClient reads the auth storage adapter.
 */
import {
  clearLegacySupabaseAuthStorage,
  purgeWrongProjectAuthSessions,
  repairSupabaseAuthStorage,
} from './supabaseStorageKey';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from './passwordRecoveryUrl';

if (typeof window !== 'undefined') {
  try {
    if (isPasswordRecoveryUrl()) {
      redirectToPasswordRecoveryPage();
    }
  } catch {
    /* ignore malformed URL */
  }
}

purgeWrongProjectAuthSessions();
clearLegacySupabaseAuthStorage();
repairSupabaseAuthStorage();
