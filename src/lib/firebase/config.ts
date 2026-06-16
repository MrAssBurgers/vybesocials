/**
 * Firebase configuration from Vite environment variables.
 * Never hardcode API keys in source — set in .env / Lovable Cloud secrets.
 */

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

  if (!apiKey || !projectId) {
    throw new Error(
      'Firebase is not configured. Set VITE_FIREBASE_* variables in .env (see .env.example).',
    );
  }

  return {
    apiKey,
    authDomain: envValue('VITE_FIREBASE_AUTH_DOMAIN') || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: envValue('VITE_FIREBASE_STORAGE_BUCKET') || `${projectId}.appspot.com`,
    messagingSenderId: envValue('VITE_FIREBASE_MESSAGING_SENDER_ID') || '',
    appId: envValue('VITE_FIREBASE_APP_ID') || '',
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
