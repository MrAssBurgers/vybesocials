/**
 * Firebase client — single entry point for app data access.
 * Replaces the legacy Supabase integration.
 */
export { db, db as default } from '@/lib/firebase';
export type { DataClient } from '@/lib/firebase';
