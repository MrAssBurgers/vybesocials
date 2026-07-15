/**
 * Firebase configuration from Vite environment variables.
 * Never hardcode API keys in source — set in .env / Lovable Cloud secrets.
 */

import { getFirebaseAuthDomain } from './authDomain';
import { authWarn } from '@/lib/authLog';

export interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  functionsRegion: string;
}

function envValue(name: string): string {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function getFirebaseConfig(): FirebaseEnvConfig {
  const apiKey = envValue('VITE_FIREBASE_API_KEY');
  const projectId = envValue('VITE_FIREBASE_PROJECT_ID');
  const messagingSenderId = envValue('VITE_FIREBASE_MESSAGING_SENDER_ID');
  const appId = envValue('VITE_FIREBASE_APP_ID');
  const storageBucket =
    envValue('VITE_FIREBASE_STORAGE_BUCKET') ||
    (projectId ? `${projectId}.appspot.com` : '');

  if (!apiKey || !projectId) {
    const missing = [
      !apiKey ? 'VITE_FIREBASE_API_KEY' : null,
      !projectId ? 'VITE_FIREBASE_PROJECT_ID' : null,
    ].filter(Boolean);
    authWarn('config_missing', { missing });
    throw new Error(
      `Firebase is not configured. Missing: ${missing.join(', ')} (see .env.example).`,
    );
  }

  const recommendedMissing = [
    !messagingSenderId ? 'VITE_FIREBASE_MESSAGING_SENDER_ID' : null,
    !appId ? 'VITE_FIREBASE_APP_ID' : null,
    !envValue('VITE_FIREBASE_STORAGE_BUCKET') ? 'VITE_FIREBASE_STORAGE_BUCKET' : null,
  ].filter(Boolean);
  if (recommendedMissing.length) {
    authWarn('config_recommended_missing', { missing: recommendedMissing });
  }

  // See authDomain.ts — custom domain does not host /__/auth/** today.
  const authDomain = getFirebaseAuthDomain(envValue('VITE_FIREBASE_AUTH_DOMAIN'));

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId: envValue('VITE_FIREBASE_MEASUREMENT_ID') || undefined,
    functionsRegion: envValue('VITE_FIREBASE_FUNCTIONS_REGION') || 'us-central1',
  };
}

export function isFirebaseConfigured(): boolean {
  try {
    getFirebaseConfig();
    return true;
  } catch {
    return false;
  }
}

export { getFirebaseAuthDomain } from './authDomain';
