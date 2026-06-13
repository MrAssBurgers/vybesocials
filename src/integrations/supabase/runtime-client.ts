import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { supabaseAuthStorage } from '@/lib/supabaseAuthStorage';
import {
  getCanonicalPublishableKey,
  getCanonicalSupabaseUrl,
} from '@/lib/canonicalSupabase';

const SUPABASE_URL = getCanonicalSupabaseUrl();
const SUPABASE_PUBLISHABLE_KEY = getCanonicalPublishableKey();

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: supabaseAuthStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
