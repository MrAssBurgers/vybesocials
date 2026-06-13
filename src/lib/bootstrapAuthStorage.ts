/**
 * Runs before the Supabase client module initializes so localStorage is
 * repaired/migrated before createClient reads the auth storage adapter.
 */
import { repairSupabaseAuthStorage } from './supabaseStorageKey';

repairSupabaseAuthStorage();
