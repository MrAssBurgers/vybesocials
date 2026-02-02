// VYBE Service Worker for Push Notifications
// Version 3.0 - Enhanced cross-device support with improved iOS/Android handling

const CACHE_NAME = 'vybe-v4';
const APP_ICON = '/icons/icon-192x192.png';
const BADGE_ICON = '/icons/icon-96x96.png';

// Always bypass cache for PWA icons so updated PNGs are fetched immediately
const FORCE_REFRESH_PATHS = new Set([
  '/icons/vybe-192.png',
  '/icons/vybe-512.png',
]);

// Detect platform for customization
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(self.navigator?.userAgent || '');
};

const isAndroid = () => {
  return /Android/.test(self.navigator?.userAgent || '');
};

// Install event - take control immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing VYBE Service Worker v4');
  self.skipWaiting();
});

// Activate event - claim all clients
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating VYBE Service Worker v4');
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Clean up old caches
      caches.keys().then((names) => {
        return Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      }),
    ])
  );
});

// Force-refresh updated PWA icons (prevents stale cached JPEG responses)
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);
    if (FORCE_REFRESH_PATHS.has(url.pathname)) {
      event.respondWith(
        fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
      );
    }
  } catch {
    // Ignore URL parsing errors
  }
});

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
  let body = data.body || 'You have a new notification';
  let icon = data.icon || APP_ICON;
  let badge = BADGE_ICON;
  let tag = data.tag || `vybe-${notificationType}-${Date.now()}`;
  let actions = [];
  let requireInteraction = false;
  
  // Platform-specific vibration patterns
  let vibrate = isIOS() ? [] : [100, 50, 100]; // iOS ignores vibrate

  // Customize based on notification type
  switch (notificationType) {
    case 'call':
      // Incoming call - high priority
      title = `📞 ${data.callerName || 'Someone'} is calling`;
      body = data.callType === 'video' ? 'Video call' : 'Audio call';
      tag = `vybe-call-${data.callId || Date.now()}`;
      requireInteraction = true;
      vibrate = isIOS() ? [] : [300, 100, 300, 100, 300, 100, 300];
      
      // Action buttons (not supported on iOS Safari)
      if (!isIOS()) {
        actions = [
          { action: 'accept', title: '✓ Answer', icon: APP_ICON },
          { action: 'decline', title: '✗ Decline', icon: APP_ICON },
        ];
      }
      break;
      
    case 'message':
    case 'dm':
      // Direct message
      title = data.senderName || 'New message';
      body = data.preview || data.body || 'Sent you a message';
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
      // Group chat message
      title = data.groupName || 'Group message';
      body = data.senderName ? `${data.senderName}: ${data.preview || 'New message'}` : (data.preview || 'New message');
      tag = `vybe-group-${data.conversationId || Date.now()}`;
      vibrate = isIOS() ? [] : [100, 30, 100];
      break;
      
    case 'friend_request':
      title = '👋 New friend request';
      body = `${data.senderName || 'Someone'} wants to be your friend`;
      tag = 'vybe-friend-request';
      vibrate = isIOS() ? [] : [100, 50, 100, 50, 100];
      
      if (!isIOS()) {
        actions = [
          { action: 'accept', title: 'Accept', icon: APP_ICON },
          { action: 'view', title: 'View', icon: APP_ICON },
        ];
      }
      break;
      
    case 'friend_accepted':
      title = '🎉 Friend request accepted';
      body = `${data.senderName || 'Someone'} accepted your request!`;
      tag = 'vybe-friend-accepted';
      vibrate = isIOS() ? [] : [100, 100, 100, 100, 200];
      break;
      
    case 'like':
      title = '❤️ New like';
      body = `${data.senderName || 'Someone'} liked your post`;
      tag = `vybe-like-${data.postId || Date.now()}`;
      vibrate = isIOS() ? [] : [50, 50];
      break;
      
    case 'comment':
      title = '💬 New comment';
      body = data.preview || `${data.senderName || 'Someone'} commented on your post`;
      tag = `vybe-comment-${data.postId || Date.now()}`;
      vibrate = isIOS() ? [] : [100, 50, 100];
      break;
      
    case 'missed_call':
      title = '📵 Missed call';
      body = `You missed a call from ${data.callerName || 'someone'}`;
      tag = `vybe-missed-${data.callId || Date.now()}`;
      vibrate = isIOS() ? [] : [200, 100, 200];
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
      postId: data.postId,
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
  if (data.type === 'call') {
    if (action === 'accept') {
      targetUrl = `/messages/${data.conversationId}?acceptCall=true`;
    } else if (action === 'decline') {
      // Just close notification, call will be declined
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
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing window and focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => {
            // Navigate to the target URL
            return client.navigate(targetUrl);
          });
        }
      }
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
