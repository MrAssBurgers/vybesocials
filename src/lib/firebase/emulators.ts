import type { FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { isLocalPreview, LOCAL_PREVIEW_PORTS, LOCAL_PREVIEW_PROJECT } from './localPreview';

const connected = new WeakSet<FirebaseApp>();

/** Configure before returning the app, including consumers using the SDK directly. */
export function connectLocalPreview(app: FirebaseApp, region: string) {
  if (!isLocalPreview() || connected.has(app)) return;
  if (app.options.projectId !== LOCAL_PREVIEW_PROJECT) throw new Error('Refusing to connect a real Firebase project to local QA.');
  if (region !== 'us-central1') throw new Error('Local QA Functions require the fixed us-central1 region.');
  const firestore = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalForceLongPolling: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', LOCAL_PREVIEW_PORTS.firestore);
  connectStorageEmulator(getStorage(app), location.hostname, Number(location.port));
  // isLocalPreview already requires loopback port 8082. Vite forwards this
  // exact demo callable/bucket routes to unchanged emulators on 5101/9399.
  connectFunctionsEmulator(getFunctions(app, region), location.hostname, Number(location.port));
  connected.add(app);
}

export function connectLocalPreviewAuth(auth: Auth) {
  if (!isLocalPreview()) return;
  if (auth.app.options.projectId !== LOCAL_PREVIEW_PROJECT) throw new Error('Refusing to use a real account in local QA.');
  if (!auth.emulatorConfig) connectAuthEmulator(auth, `http://127.0.0.1:${LOCAL_PREVIEW_PORTS.auth}`, { disableWarnings: true });
  if (auth.emulatorConfig?.host !== '127.0.0.1' || auth.emulatorConfig.port !== LOCAL_PREVIEW_PORTS.auth) throw new Error('Local QA Authentication endpoint mismatch.');
}
