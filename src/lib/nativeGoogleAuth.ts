import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { supabase } from '@/integrations/supabase/client';
import { isNativePlatform } from './capacitor';

let initialized = false;

/**
 * Native Google Sign-In for Capacitor (iOS/Android).
 * Uses the system account picker sheet — no in-app browser window.
 *
 * Requires platform config:
 *  - iOS: GIDClientID + REVERSED_CLIENT_ID URL scheme in Info.plist (iOS client ID)
 *  - Android: SHA-1 fingerprint registered with Android OAuth client ID
 *  - Web client ID set in capacitor.config (plugins.GoogleAuth.clientId) — used to mint
 *    the ID token that Supabase verifies.
 */
async function ensureInit() {
  if (initialized) return;
  try {
    // serverClientId/clientId are read from capacitor.config plugins.GoogleAuth.
    // initialize() is safe to call once at boot.
    await GoogleAuth.initialize({
      scopes: ['profile', 'email'],
      grantOfflineAccess: false,
    });
    initialized = true;
  } catch (e) {
    console.warn('[NativeGoogleAuth] init failed', e);
  }
}

export async function signInWithNativeGoogle() {
  if (!isNativePlatform) {
    throw new Error('Native Google Sign-In only available on iOS/Android');
  }
  await ensureInit();
  const result = await GoogleAuth.signIn();
  const idToken = result.authentication?.idToken;
  if (!idToken) throw new Error('No Google ID token returned');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  return data;
}

export async function signOutNativeGoogle() {
  if (!isNativePlatform) return;
  try { await GoogleAuth.signOut(); } catch { /* ignore */ }
}
