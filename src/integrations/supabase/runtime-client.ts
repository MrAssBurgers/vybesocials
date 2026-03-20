import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const FALLBACK_PROJECT_ID = 'agtcyxjxgkdyoxwxkjth';
const FALLBACK_SUPABASE_URL = `https://${FALLBACK_PROJECT_ID}.supabase.co`;
const FALLBACK_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFndGN5eGp4Z2tkeW94d3hranRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjk5NTMsImV4cCI6MjA4NTgwNTk1M30.G92pPYU9K2z3yqXtN5R7WR_-EAIVTfl-T-GlJ-N8oYg';

function resolveSupabaseUrl() {
  const configuredUrl = import.meta.env.VITE_SUPABASE_URL;
  if (typeof configuredUrl === 'string' && /^https?:\/\//.test(configuredUrl)) {
    return configuredUrl;
  }

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (typeof projectId === 'string' && projectId.length > 0) {
    return `https://${projectId}.supabase.co`;
  }

  return FALLBACK_SUPABASE_URL;
}

function resolvePublishableKey() {
  const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof configuredKey === 'string' && configuredKey.startsWith('eyJ')) {
    return configuredKey;
  }

  return FALLBACK_PUBLISHABLE_KEY;
}

export const SUPABASE_URL = resolveSupabaseUrl();
export const SUPABASE_PUBLISHABLE_KEY = resolvePublishableKey();

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});