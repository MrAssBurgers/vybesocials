// VYBE Service Worker
// Version 20.0 — single Supabase: hprmic primary post-migration (2026-06-16)

const CACHE_NAME = 'vybe-v20';
const STATIC_CACHE = 'vybe-static-v20';
const MEDIA_CACHE = 'vybe-media-v2';
const SHELL_CACHE = 'vybe-shell-v4';
const ASSETS_CACHE = 'vybe-assets-v4';
const SHELL_URL = '/';
const ASSETS_CACHE_MAX = 180;
const APP_ICON = '/icons/icon-192x192.png';
const BADGE_ICON = '/icons/icon-96x96.png';

// Assets to precache on install
const PRECACHE_ASSETS = [
  '/favicon.ico',
  '/favicon.png',
  APP_ICON,
  BADGE_ICON,
];

// Always bypass cache for these paths
const FORCE_REFRESH_PATHS = new Set([
  '/icons/vybe-192.png',
  '/icons/vybe-512.png',
]);

// API/dynamic paths that should use network-first
const NETWORK_FIRST_PATTERNS = [
  '/rest/v1/',
  '/auth/v1/',
  '/functions/v1/',
  '/realtime/',
  '/storage/v1/',
];

// Media paths that should use cache-first (long-lived)
const CACHE_FIRST_PATTERNS = [
  '/storage/v1/object/public/',
  '/storage/v1/object/sign/',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// Detect platform
const isIOS = () => /iPad|iPhone|iPod/.test(self.navigator?.userAgent || '');
const isAndroid = () => /Android/.test(self.navigator?.userAgent || '');

// Install event - precache critical assets + warm app shell
self.addEventListener('install', (event) => {
  console.log('[SW] Installing VYBE Service Worker v12');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) =>
        cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Precache partial failure:', err);
        })
      ),
      // Best-effort warm the SPA shell so first offline reload works.
      caches.open(SHELL_CACHE).then((cache) =>
        fetch(SHELL_URL, { cache: 'reload' })
          .then((res) => (res && res.ok ? cache.put(SHELL_URL, res.clone()) : null))
          .catch(() => null)
      ),
    ])
  );
  self.skipWaiting();
});

// Activate event - clean old caches, claim clients
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating VYBE Service Worker v12');
  const VALID_CACHES = new Set([CACHE_NAME, STATIC_CACHE, MEDIA_CACHE, SHELL_CACHE, ASSETS_CACHE]);
  event.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((names) =>
        Promise.all(
          names.filter((n) => !VALID_CACHES.has(n)).map((n) => caches.delete(n))
        )
      ),
    ])
  );
});

// Paths that must NEVER be intercepted by the service worker (OAuth redirects, etc.)
const SW_BYPASS_PATHS = ['/~oauth', '/spotify/callback'];

// Fetch handler - routing strategy
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);

    // CRITICAL: Never intercept OAuth redirect paths — must always hit the network
    if (SW_BYPASS_PATHS.some((p) => url.pathname.startsWith(p))) return;

    // Force-refresh updated PWA icons
    if (FORCE_REFRESH_PATHS.has(url.pathname)) {
      event.respondWith(
        fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
      );
      return;
    }

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip chrome-extension, devtools, etc.
    if (!url.protocol.startsWith('http')) return;

    // Navigation requests: network-first, fall back to cached app shell so the
    // real Vybe UI loads offline instead of a placeholder page.
    if (event.request.mode === 'navigate') {
      event.respondWith(navigationStrategy(event.request));
      return;
    }

    // Network-first for API calls
    if (NETWORK_FIRST_PATTERNS.some((p) => url.pathname.includes(p) || url.href.includes(p))) {
      event.respondWith(networkFirst(event.request));
      return;
    }

    // Cache-first for media/fonts (immutable assets)
    if (CACHE_FIRST_PATTERNS.some((p) => url.href.includes(p))) {
      event.respondWith(cacheFirst(event.request, MEDIA_CACHE));
      return;
    }

    // Same-origin JS/CSS/font chunks (with or without content hash) — stale
    // while revalidate so the app shell can boot offline after one online visit.
    if (
      url.origin === self.location.origin &&
      /\.(?:js|mjs|css|woff2?|ttf|otf)(?:\?.*)?$/i.test(url.pathname)
    ) {
      event.respondWith(staleWhileRevalidateCapped(event.request, ASSETS_CACHE, ASSETS_CACHE_MAX));
      return;
    }

    // Same-origin images (post media thumbs, icons, etc.) — cache-first so
    // already-seen images stay visible offline and when scrolling fast.
    if (
      url.origin === self.location.origin &&
      /\.(?:png|jpe?g|gif|webp|avif|svg|ico)(?:\?.*)?$/i.test(url.pathname)
    ) {
      event.respondWith(cacheFirst(event.request, MEDIA_CACHE));
      return;
    }
  } catch {
    // Ignore URL parsing errors
  }
});

// Navigation strategy: try network with a short timeout, otherwise serve
// the cached SPA shell so React boots and renders persisted data offline.
async function navigationStrategy(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);
    if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaqueredirect') {
      // Keep a single canonical shell entry keyed to '/'.
      try {
        cache.put(SHELL_URL, networkResponse.clone());
      } catch {
        /* ignore quota */
      }
    }
    return networkResponse;
  } catch {
    const cachedShell = (await cache.match(SHELL_URL)) || (await caches.match(SHELL_URL));
    if (cachedShell) return cachedShell;
    return new Response('', { status: 204 });
  }
}

// Stale-while-revalidate with simple FIFO cap to prevent unbounded growth
// across deploys (each deploy ships fresh content-hashed filenames).
async function staleWhileRevalidateCapped(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        try {
          await cache.put(request, response.clone());
          const keys = await cache.keys();
          if (keys.length > maxEntries) {
            const excess = keys.length - maxEntries;
            for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
          }
        } catch {
          /* ignore */
        }
      }
      return response;
    })
    .catch(() => null);
  if (cached) {
    networkPromise; // fire-and-forget revalidation
    return cached;
  }
  const network = await networkPromise;
  return network || new Response('', { status: 504 });
}

// Strategy: Network first, fallback to cache, then lightweight empty response
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Strategy: Cache first, fallback to network (for immutable assets)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

// Push notification event - handle incoming push messages
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);
  
  if (!event.data) {
    console.log('[SW] No push data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e);
    data = {
      title: 'VYBE',
      body: event.data.text() || 'You have a new notification',
    };
  }

  console.log('[SW] Push data:', data);

  // Determine notification type and customize
  const notificationType = data.type || 'general';
  let title = data.title || 'VYBE';
  let body = data.body || data.preview || 'You have a new notification';
  let icon = data.senderAvatar || data.icon || APP_ICON;
  let badge = BADGE_ICON;
  let tag = data.tag || `vybe-${notificationType}-${Date.now()}`;
  let actions = [];
  let requireInteraction = false;
  
  // Platform-specific vibration patterns
  let vibrate = isIOS() ? [] : [100, 50, 100]; // iOS ignores vibrate

  // Customize based on notification type
  switch (notificationType) {
    case 'call':
    case 'incoming_call':
      title = data.callerName || data.title || 'Someone';
      body = data.body || (data.callType === 'video' ? 'Video call' : 'Audio call');
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-call-${data.callId || Date.now()}`;
      requireInteraction = true;
      vibrate = isIOS() ? [] : [300, 100, 300, 100, 300, 100, 300];
      
      if (!isIOS()) {
        actions = [
          { action: 'accept', title: '✓ Answer', icon: APP_ICON },
          { action: 'decline', title: '✗ Decline', icon: APP_ICON },
        ];
      }
      break;
      
    case 'message':
    case 'dm':
      title = data.senderName || data.title || 'New message';
      body = data.preview || data.body || 'New Chat';
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-dm-${data.conversationId || Date.now()}`;
      vibrate = isIOS() ? [] : [100, 50, 100];
      
      if (!isIOS()) {
        actions = [
          { action: 'reply', title: 'Reply', icon: APP_ICON },
          { action: 'view', title: 'View', icon: APP_ICON },
        ];
      }
      break;
      
    case 'group_message':
      title = data.groupName || data.title || 'Group message';
      body = data.senderName
        ? `${data.senderName}: ${data.preview || data.body || 'New message'}`
        : (data.preview || data.body || 'New message');
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-dm-${data.conversationId || Date.now()}`;
      vibrate = isIOS() ? [] : [100, 30, 100];
      break;

    case 'story_like':
      title = data.senderName || data.actorName || data.title || 'Someone';
      body = data.body || 'liked your story';
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-story-like-${data.actorId || Date.now()}`;
      vibrate = isIOS() ? [] : [80, 40, 80];
      break;

    case 'story_view':
      title = data.senderName || data.actorName || data.title || 'Someone';
      body = data.body || 'viewed your story';
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-story-view-${data.actorId || Date.now()}`;
      vibrate = isIOS() ? [] : [60, 30, 60];
      break;
      
    case 'friend_request':
      title = data.senderName || data.actorName || data.title || 'Someone';
      body = data.body || 'added you';
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-friend-${data.actorId || 'request'}`;
      vibrate = isIOS() ? [] : [100, 50, 100, 50, 100];
      
      if (!isIOS()) {
        actions = [
          { action: 'accept', title: 'Accept', icon: APP_ICON },
          { action: 'view', title: 'View', icon: APP_ICON },
        ];
      }
      break;
      
    case 'friend_accepted':
      title = data.senderName || data.actorName || data.title || 'Someone';
      body = data.body || 'accepted your friend request';
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-friend-${data.actorId || 'accepted'}`;
      vibrate = isIOS() ? [] : [100, 100, 100, 100, 200];
      break;
      
    case 'like':
      title = data.senderName || data.actorName || data.title || 'Someone';
      body = data.body || 'is feeling your post';
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-like-${data.postId || Date.now()}`;
      vibrate = isIOS() ? [] : [50, 50];
      break;
      
    case 'comment':
      title = data.senderName || data.actorName || data.title || 'Someone';
      body = data.preview || data.body || 'commented on your post';
      icon = data.senderAvatar || data.image_url || APP_ICON;
      tag = `vybe-comment-${data.postId || Date.now()}`;
      vibrate = isIOS() ? [] : [100, 50, 100];
      break;
      
    case 'missed_call':
      title = '📵 Missed call';
      body = `You missed a call from ${data.callerName || 'someone'}`;
      tag = `vybe-missed-${data.callId || Date.now()}`;
      vibrate = isIOS() ? [] : [200, 100, 200];
      break;

    case 'smart_ping':
      // Rich contextual ping (nearby, brief, friend activity)
      tag = `vybe-smart-${data.subtype || 'ping'}-${data.post_id || Date.now()}`;
      vibrate = isIOS() ? [] : [60, 40, 60];
      if (!isIOS()) {
        actions = [
          { action: 'open', title: 'Open', icon: APP_ICON },
          { action: 'mute1h', title: 'Mute 1h', icon: APP_ICON },
        ];
      }
      break;

    default:
      // General notification
      vibrate = isIOS() ? [] : [100, 50, 100];
      break;
  }

  const options = {
    body,
    icon,
    badge,
    image: data.image || data.image_url || undefined,
    vibrate,
    tag,
    renotify: true,
    requireInteraction,
    actions,
    data: {
      url: data.url || '/',
      type: notificationType,
      conversationId: data.conversationId,
      callId: data.callId,
      postId: data.postId || data.post_id,
      subtype: data.subtype,
      timestamp: Date.now(),
    },
    // iOS/Safari specific - silent must be false to make sound
    silent: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event - handle user interaction
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action, event.notification.data);
  
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;
  let targetUrl = data.url || '/';

  // Handle specific actions
  if (data.type === 'call' || data.type === 'incoming_call') {
    if (action === 'accept') {
      const qs = new URLSearchParams();
      if (data.callId) qs.set('call', data.callId);
      qs.set('action', 'accept');
      targetUrl = data.conversationId
        ? `/messages/${data.conversationId}?${qs.toString()}`
        : '/messages';
    } else if (action === 'decline') {
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
          for (const client of clientList) {
            client.postMessage({
              type: 'NOTIFICATION_CLICK',
              action: 'decline',
              payload: data,
            });
          }
        })
      );
      return;
    }
  } else if (data.type === 'message' || data.type === 'dm' || data.type === 'group_message') {
    if (action === 'reply' || action === 'view' || !action) {
      targetUrl = data.conversationId ? `/messages/${data.conversationId}` : '/messages';
    }
  } else if (data.type === 'friend_request' || data.type === 'friend_accepted') {
    targetUrl = '/notifications';
  } else if (data.type === 'like' || data.type === 'comment') {
    targetUrl = data.postId ? `/p/${data.postId}` : '/notifications';
  } else if (data.type === 'smart_ping') {
    if (action === 'mute1h') {
      // Fire-and-forget mute via edge function (uses any open client's session)
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
          const c = list[0];
          if (c) c.postMessage({ type: 'MUTE_SMART_PINGS', hours: 1 });
        })
      );
      return;
    }
    targetUrl = data.url || '/notifications';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const notifyClients = () => {
        for (const client of clientList) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            action: action || 'open',
            payload: { ...data, url: targetUrl, path: targetUrl },
          });
        }
      };

      // Try to find an existing window and focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => {
            notifyClients();
            if (client.navigate) return client.navigate(targetUrl);
          });
        }
      }
      notifyClients();
      // No existing window, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
  
  // For call notifications, if closed without action, treat as declined
  const data = event.notification.data || {};
  if (data.type === 'call' && data.callId) {
    // Could send a message to decline the call
    console.log('[SW] Call notification dismissed:', data.callId);
  }
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle push subscription updates
  if (event.data.type === 'CHECK_SUBSCRIPTION') {
    self.registration.pushManager.getSubscription().then((subscription) => {
      event.source.postMessage({
        type: 'SUBSCRIPTION_STATUS',
        isSubscribed: !!subscription,
      });
    });
  }
});

// Periodic sync for keeping subscription fresh (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-push-subscription') {
    event.waitUntil(refreshPushSubscription());
  }
});

async function refreshPushSubscription() {
  try {
    const subscription = await self.registration.pushManager.getSubscription();
    if (subscription) {
      console.log('[SW] Push subscription still active');
    }
  } catch (error) {
    console.error('[SW] Error refreshing subscription:', error);
  }
}
