 import { supabase } from '@/integrations/supabase/client';
 
 /**
  * Send a push notification to a specific user via the edge function
  */
 export async function sendPushNotification(options: {
   userId: string;
   title: string;
   body: string;
   url?: string;
   tag?: string;
   type?: 'message' | 'dm' | 'group_message' | 'call' | 'friend_request' | 'friend_accepted' | 'like' | 'comment' | 'general';
   data?: Record<string, unknown>;
 }) {
   try {
     const { data, error } = await supabase.functions.invoke('send-push-notification', {
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
       console.error('[Push] Failed to send push notification:', error);
       return { success: false, error };
     }
 
     console.log('[Push] Push notification result:', data);
     return { success: true, data };
   } catch (err) {
     console.error('[Push] Error sending push notification:', err);
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
     url: `/messages/${conversationId}`,
     tag: `vybe-call-${callId}`,
     type: 'call',
     data: {
       callId,
       callerName,
       callType,
       conversationId,
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