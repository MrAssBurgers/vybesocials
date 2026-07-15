/**
 * FCM web push wiring. Registers the service worker, requests permission,
 * retrieves an FCM token via the VAPID key, and stores it in push_tokens.
 *
 * Usage:
 *   import { initWebPush } from '@/lib/firebase/messaging';
 *   useEffect(() => { if (user) initWebPush(); }, [user]);
 */
import { getApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { db } from '@/integrations/firebase/client';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { getFirebaseAuth } from '@/lib/firebase/authService';

let _messaging: Messaging | null = null;
let _vapidKey: string | null = null;

async function fetchVapidKey(): Promise<string | null> {
  if (_vapidKey) return _vapidKey;
  // Prefer build-time value, fall back to callable
  const env = (import.meta as any)?.env?.VITE_FIREBASE_VAPID_KEY;
  if (env) { _vapidKey = env; return env; }
  try {
    const fn = httpsCallable(getFunctions(getApp()), 'getVapidKey');
    const res: any = await fn({});
    if (res?.data?.key) { _vapidKey = res.data.key; return _vapidKey; }
  } catch (e) { console.warn('[push] getVapidKey failed', e); }
  return null;
}

async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  } catch (e) {
    console.warn('[push] SW register failed', e);
    return null;
  }
}

export async function initWebPush(opts: { silent?: boolean } = {}): Promise<{ ok: boolean; token?: string; reason?: string }> {
  if (typeof window === 'undefined') return { ok: false, reason: 'ssr' };
  if (!('Notification' in window)) return { ok: false, reason: 'unsupported' };
  const user = getFirebaseAuth()?.currentUser;
  if (!user) return { ok: false, reason: 'unauthenticated' };

  let perm = Notification.permission;
  if (perm === 'default' && !opts.silent) perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };

  const swReg = await registerSw();
  const vapidKey = await fetchVapidKey();
  if (!vapidKey) return { ok: false, reason: 'no_vapid_key' };

  if (!_messaging) _messaging = getMessaging(getApp());
  try {
    const token = await getToken(_messaging, { vapidKey, serviceWorkerRegistration: swReg || undefined });
    if (!token) return { ok: false, reason: 'no_token' };
    await setDoc(doc(db as any, 'push_tokens', `${user.uid}_web`), {
      user_id: user.uid, token, platform: 'web',
      user_agent: navigator.userAgent,
      updated_at: serverTimestamp(),
    }, { merge: true });
    // Optional: link to OneSignal external user id mapping
    try {
      const link = httpsCallable(getFunctions(getApp()), 'linkOnesignalUser');
      await link({ token, platform: 'web' });
    } catch { /* non-fatal */ }
    return { ok: true, token };
  } catch (e: any) {
    console.warn('[push] getToken failed', e);
    return { ok: false, reason: e?.message || 'token_error' };
  }
}

export function onForegroundPush(handler: (payload: any) => void): () => void {
  if (!_messaging) try { _messaging = getMessaging(getApp()); } catch { return () => {}; }
  return onMessage(_messaging!, handler);
}
