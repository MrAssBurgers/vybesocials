import { db } from '@/lib/firebase';
import { scheduleOfflinePush, isNativeShell } from '@/lib/despiaPush';

function isCapacityFault(error: unknown): boolean {
  const msg =
    error && typeof error === 'object'
      ? String((error as { message?: string; name?: string }).message || (error as { name?: string }).name || '')
      : String(error || '');
  return /internal|cpu_allocation|no available instance|resource-exhausted|quota/i.test(msg);
}

/**
 * Send a push notification to a specific user via the edge function.
 * Failures never throw — callers must not gate UX on push success.
 */
export async function sendPushNotification(options: {
  userId: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: 'message' | 'dm' | 'group_message' | 'typing' | 'call' | 'friend_request' | 'friend_accepted' | 'like' | 'comment' | 'general';
  data?: Record<string, unknown>;
}) {
  try {
    const { data, error } = await db.functions.invoke('send-push-notification', {
      body: {
        userId: options.userId,
        title: options.title,
        body: options.body,
        url: options.url,
        tag: options.tag,
        type: options.type || 'general',
        data: options.data,
      },
    });

    if (error) {
      // Capacity / OneSignal CF faults are upstream — soft-log so DM UX stays clean.
      if (isCapacityFault(error)) {
        console.warn('[Push] skipped (capacity):', error);
      } else {
        console.error('[Push] Failed to send push notification:', error);
      }
      return { success: false, error };
    }

    console.log('[Push] Push notification result:', data);
    return { success: true, data };
  } catch (err) {
    if (isCapacityFault(err)) {
      console.warn('[Push] skipped (capacity):', err);
    } else {
      console.error('[Push] Error sending push notification:', err);
    }
    return { success: false, error: err };
  }
}
 
 /**
  * Send a message push notification to a user
  */
 export async function sendMessagePush(
   recipientUserId: string,
   senderName: string,
   messagePreview: string,
   conversationId: string,
   isGroup?: boolean,
   groupName?: string
 ) {
   return sendPushNotification({
     userId: recipientUserId,
     title: isGroup ? (groupName || 'Group') : senderName,
     body: isGroup ? `${senderName}: ${messagePreview}` : messagePreview,
     url: `/messages/${conversationId}`,
     tag: `vybe-dm-${conversationId}`,
     type: isGroup ? 'group_message' : 'dm',
     data: {
       conversationId,
       senderName,
       preview: messagePreview,
     },
   });
 }
 
 /**
  * Send a call push notification
  */
 export async function sendCallPush(
   recipientUserId: string,
   callerName: string,
   callId: string,
   callType: 'audio' | 'video',
   conversationId: string
 ) {
   return sendPushNotification({
     userId: recipientUserId,
     title: `${callerName} is calling`,
     body: callType === 'video' ? 'Video call' : 'Audio call',
     url: `/messages/${conversationId}?call=${callId}`,
     tag: `vybe-call-${callId}`,
     type: 'call',
     data: {
       callId,
       callerName,
       callType,
       conversationId,
       path: `/messages/${conversationId}?call=${callId}`,
     },
   });
 }
 
 /**
  * Send a friend request push notification
  */
 export async function sendFriendRequestPush(
   recipientUserId: string,
   senderName: string
 ) {
   return sendPushNotification({
     userId: recipientUserId,
     title: 'New friend request',
     body: `${senderName} wants to be your friend`,
     url: '/notifications',
     tag: 'vybe-friend-request',
     type: 'friend_request',
     data: {
       senderName,
     },
   });
 }
 
 /**
  * Send a friend accepted push notification
  */
 export async function sendFriendAcceptedPush(
   recipientUserId: string,
   acceptorName: string
 ) {
   return sendPushNotification({
     userId: recipientUserId,
     title: 'Friend request accepted',
     body: `${acceptorName} accepted your request!`,
     url: '/notifications',
     tag: 'vybe-friend-accepted',
     type: 'friend_accepted',
     data: {
       senderName: acceptorName,
     },
  });
}

/**
 * Schedule a reminder for the CURRENT user with dual delivery:
 *   1. Despia local push — fires fully offline on the native shell (primary)
 *   2. OneSignal server push — fires when device is online (fallback for web/PWA
 *      or when the local push silently failed)
 *
 * Use for user-initiated reminders ("remind me in 1 hour", timers, scheduled
 * nudges). Not for cross-user notifications.
 */
export async function scheduleReminder(options: {
  /** Current user's ID — required so OneSignal can target their devices. */
  userId: string;
  delaySeconds: number;
  title: string;
  body: string;
  /** Deep link opened on tap. Defaults to current origin. */
  url?: string;
  tag?: string;
}) {
  const delay = Math.max(0, Math.floor(options.delaySeconds));
  let localScheduled = false;

  // 1. Local offline push (Despia native shell only)
  if (isNativeShell()) {
    localScheduled = scheduleOfflinePush({
      delaySeconds: delay,
      title: options.title,
      body: options.body,
      url: options.url,
    });
  }

  // 2. Server-side OneSignal as fallback (works for web/PWA, and as a backup
  //    when the local push didn't register). The edge function handles the
  //    delay if `delaySeconds` is provided; otherwise fires immediately.
  let serverResult: { success: boolean; error?: unknown } = { success: false };
  try {
    serverResult = await sendPushNotification({
      userId: options.userId,
      title: options.title,
      body: options.body,
      url: options.url,
      tag: options.tag || `vybe-reminder-${Date.now()}`,
      type: 'general',
      data: {
        kind: 'reminder',
        delaySeconds: delay,
        scheduledFor: new Date(Date.now() + delay * 1000).toISOString(),
      },
    });
  } catch (err) {
    serverResult = { success: false, error: err };
  }

  return {
    localScheduled,
    serverScheduled: serverResult.success,
    // True if at least one delivery path succeeded.
    success: localScheduled || serverResult.success,
  };
}