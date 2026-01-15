// VYBE Service Worker for Push Notifications
// Version 2.0 - Enhanced for DM and Call notifications

const CACHE_NAME = 'vybe-v2';
const APP_ICON = '/icons/icon-192x192.png';
const BADGE_ICON = '/icons/icon-96x96.png';

// Install event - take control immediately
self.addEventListener('install', (event) => {
  console.log('[SW] Installing VYBE Service Worker v2');
  self.skipWaiting();
});

// Activate event - claim all clients
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating VYBE Service Worker v2');
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
  let vibrate = [100, 50, 100];

  // Customize based on notification type
  switch (notificationType) {
    case 'call':
      // Incoming call - high priority
      title = `📞 ${data.callerName || 'Someone'} is calling`;
      body = data.callType === 'video' ? 'FaceTime call' : 'Audio call';
      tag = `vybe-call-${data.callId || Date.now()}`;
      requireInteraction = true;
      vibrate = [300, 100, 300, 100, 300];
      actions = [
        { action: 'accept', title: '✓ Answer', icon: APP_ICON },
        { action: 'decline', title: '✗ Decline', icon: APP_ICON },
      ];
      break;
      
    case 'message':
    case 'dm':
      // Direct message
      title = data.senderName || 'New message';
      body = data.preview || data.body || 'Sent you a message';
      tag = `vybe-dm-${data.conversationId || Date.now()}`;
      actions = [
        { action: 'reply', title: 'Reply', icon: APP_ICON },
        { action: 'view', title: 'View', icon: APP_ICON },
      ];
      break;
      
    case 'group_message':
      // Group chat message
      title = data.groupName || 'Group message';
      body = data.senderName ? `${data.senderName}: ${data.preview || 'New message'}` : (data.preview || 'New message');
      tag = `vybe-group-${data.conversationId || Date.now()}`;
      break;
      
    case 'friend_request':
      title = 'New friend request';
      body = `${data.senderName || 'Someone'} wants to be your friend`;
      tag = 'vybe-friend-request';
      actions = [
        { action: 'accept', title: 'Accept', icon: APP_ICON },
        { action: 'view', title: 'View', icon: APP_ICON },
      ];
      break;
      
    case 'missed_call':
      title = '📵 Missed call';
      body = `You missed a call from ${data.callerName || 'someone'}`;
      tag = `vybe-missed-${data.callId || Date.now()}`;
      break;
      
    default:
      // General notification
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
      timestamp: Date.now(),
    },
    // iOS specific
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
  } else if (data.type === 'friend_request') {
    targetUrl = '/notifications';
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
    // For now, just log it
    console.log('[SW] Call notification dismissed:', data.callId);
  }
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
