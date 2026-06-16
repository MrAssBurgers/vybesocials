/* eslint-disable */
/* Firebase Cloud Messaging service worker — handles background push.
 * Configure with the same Firebase web config as the client.
 * Public values only — no secrets here.
 */
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.0/firebase-messaging-compat.js');

// These values are public Firebase web app config — safe to inline.
firebase.initializeApp({
  apiKey: self.__FIREBASE_API_KEY__ || 'REPLACE_AT_BUILD',
  authDomain: 'vybehub.firebaseapp.com',
  projectId: 'vybehub',
  messagingSenderId: 'REPLACE_AT_BUILD',
  appId: 'REPLACE_AT_BUILD',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title = 'VYBE', body = '', icon = '/icon-192.png', ...rest } = payload.notification || {};
  self.registration.showNotification(title, {
    body, icon, badge: '/icon-192.png',
    data: payload.data || {},
    tag: payload.data?.tag || 'vybe',
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
