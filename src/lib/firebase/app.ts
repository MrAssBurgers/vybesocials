import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirebaseConfig } from './config';

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0]!;
    return app;
  }
  app = initializeApp(getFirebaseConfig());
  return app;
}
