/**
 * Runs before the Supabase client module initializes so localStorage is
 * repaired/migrated before createClient reads the auth storage adapter.
 */
import {
  clearLegacySupabaseAuthStorage,
  purgeWrongProjectAuthSessions,
  repairSupabaseAuthStorage,
} from './supabaseStorageKey';

purgeWrongProjectAuthSessions();
clearLegacySupabaseAuthStorage();
repairSupabaseAuthStorage();
