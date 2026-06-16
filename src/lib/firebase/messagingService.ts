import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { getFirebaseApp } from './app';

let messaging: ReturnType<typeof getMessaging> | null = null;

export async function getFirebaseMessaging() {
  if (!(await isSupported())) return null;
  if (!messaging) messaging = getMessaging(getFirebaseApp());
  return messaging;
}

export async function requestFcmToken(vapidKey: string): Promise<string | null> {
  const msg = await getFirebaseMessaging();
  if (!msg) return null;
  try {
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
  return onMessage(msg, handler);
}
