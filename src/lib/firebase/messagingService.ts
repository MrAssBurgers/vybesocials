import type { Messaging } from 'firebase/messaging';
import { getFirebaseApp } from './app';
import { isLocalPreview } from './localPreview';

let messaging: Messaging | null = null;

export async function getFirebaseMessaging() {
  if (isLocalPreview()) return null;
  // Importing the SDK registers its internal provider. Functions can then ask
  // that provider for an FCM token before sending any callable request. Keep
  // the entire registration out of local QA, where push has no emulator.
  const { getMessaging, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return null;
  if (!messaging) messaging = getMessaging(getFirebaseApp());
  return messaging;
}

export async function requestFcmToken(vapidKey: string): Promise<string | null> {
  const msg = await getFirebaseMessaging();
  if (!msg) return null;
  try {
    const { getToken } = await import('firebase/messaging');
    return await getToken(msg, { vapidKey });
  } catch {
    return null;
  }
}

export async function onForegroundMessage(
  handler: (payload: unknown) => void,
): Promise<(() => void) | null> {
  const msg = await getFirebaseMessaging();
  if (!msg) return null;
  const { onMessage } = await import('firebase/messaging');
  return onMessage(msg, handler);
}
