/* Firebase Cloud Messaging service worker + root-scope tombstone.
 *
 * Legacy clients registered this file at scope "/". That stole control from
 * /sw.js and pinned sessions to old hashed app entries. When this worker is
 * still controlling "/", it now self-tombstones, clears obsolete shell caches,
 * and reloads clients once. FCM continues to work only under the narrow
 * /firebase-cloud-messaging-push-scope registration.
 */
const ROOT_TOMBSTONE_FLAG = 'vybe-fcm-root-tombstone-v2';

function isRootScope() {
  try {
    const path = new URL(self.registration.scope).pathname;
    return path === '/' || path === '';
  } catch {
    return false;
  }
}

if (isRootScope()) {
  self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        try {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((name) => /vybe-(?:v|static|shell|assets)/i.test(name))
              .map((name) => caches.delete(name)),
          );
        } catch {
          /* ignore */
        }

        const windowClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });

        await self.registration.unregister();

        for (const client of windowClients) {
          try {
            client.postMessage({ type: 'VYBE_LEGACY_SW_TOMBSTONE', version: ROOT_TOMBSTONE_FLAG });
          } catch {
            /* ignore */
          }
          try {
            if ('navigate' in client && typeof client.navigate === 'function') {
              await client.navigate(`/?_vybe_migrate=${Date.now()}`);
            }
          } catch {
            /* ignore */
          }
        }
      })(),
    );
  });
} else {
  /* Narrow-scope FCM worker — background push for DMs + calls.
   * Public Firebase web config only — no secrets.
   */
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: self.__FIREBASE_API_KEY__ || 'REPLACE_AT_BUILD',
    authDomain: 'vybe-daaab.firebaseapp.com',
    projectId: 'vybe-daaab',
    messagingSenderId: self.__FIREBASE_MESSAGING_SENDER_ID__ || 'REPLACE_AT_BUILD',
    appId: self.__FIREBASE_APP_ID__ || 'REPLACE_AT_BUILD',
  });

  const messaging = firebase.messaging();

  function payloadData(payload) {
    return { ...(payload.data || {}), ...(payload.notification || {}) };
  }

  function routeFromData(data) {
    const path = data.path || data.url;
    if (path && path.startsWith('/')) return path;
    if (data.conversationId) {
      const qs = new URLSearchParams();
      if (data.callId) qs.set('call', data.callId);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return `/messages/${data.conversationId}${suffix}`;
    }
    return '/notifications';
  }

  messaging.onBackgroundMessage((payload) => {
    const data = payloadData(payload);
    const type = (data.type || '').toLowerCase();
    const title = data.title || payload.notification?.title || 'VYBE';
    const body = data.body || payload.notification?.body || '';
    const tag = data.tag || (type === 'call' ? `vybe-call-${data.callId || 'ring'}` : 'vybe-dm');
    const url = routeFromData(data);

    const isCall = type === 'call' || !!data.callId;

    const options = {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag,
      data: { ...data, url },
      requireInteraction: isCall,
      silent: false,
      vibrate: isCall ? [300, 100, 300, 100, 300] : [120, 60, 120],
      actions: isCall
        ? [
            { action: 'accept', title: 'Answer' },
            { action: 'decline', title: 'Decline' },
          ]
        : [],
    };

    return self.registration.showNotification(title, options);
  });

  self.addEventListener('push', (event) => {
    if (!event.data) return;
    let parsed;
    try {
      parsed = event.data.json();
    } catch {
      return;
    }
    const data = typeof parsed === 'object' ? parsed : {};
    const type = (data.type || '').toLowerCase();
    if (type !== 'call' && !data.callId) return;

    const title = data.title || 'Incoming call';
    const body = data.body || '';
    const url = routeFromData(data);
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/icon-192.png',
        tag: data.tag || `vybe-call-${data.callId}`,
        data: { ...data, url },
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300],
        actions: [
          { action: 'accept', title: 'Answer' },
          { action: 'decline', title: 'Decline' },
        ],
      }),
    );
  });

  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const data = event.notification.data || {};
    const action = event.action || data.action || 'open';
    let url = data.url || '/';

    if (action === 'accept' && data.callId && data.conversationId) {
      url = `/messages/${data.conversationId}?call=${data.callId}&action=accept`;
    } else if (action === 'decline' && data.callId) {
      url = `/notifications?declineCall=${data.callId}`;
    } else if (typeof url === 'string' && !url.startsWith('/')) {
      try {
        const u = new URL(url);
        url = `${u.pathname}${u.search}`;
      } catch { /* keep */ }
    }

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(url.split('?')[0]) && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      }),
    );
  });
}
