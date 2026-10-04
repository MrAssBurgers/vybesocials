import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirebaseConfig } from './config';
import { connectLocalPreview } from './emulators';

let app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const config = getFirebaseConfig();
  const existing = getApps();
  if (existing.length > 0) {
    const candidate = existing[0]!;
    connectLocalPreview(candidate, config.functionsRegion);
    app = candidate;
    return app;
  }
  const candidate = initializeApp(config);
  connectLocalPreview(candidate, config.functionsRegion);
  app = candidate;
  return app;
}
