/**
 * Foreground DM alerts — triggered from dmScopedMessageRealtime only.
 * Server push (OneSignal/FCM) handles background/native; this covers in-app toast + sound.
 */
import { db } from '@/lib/firebase';
import { premiumSounds } from '@/lib/premiumSounds';
import { navigationRef } from '@/lib/navigationRef';
import { showMessageNotification } from '@/components/notifications/MessageNotificationToast';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { isNativePlatform } from '@/lib/capacitor';
import { dmNotificationTag, shouldShowInAppNotification } from '@/lib/inAppNotificationDedupe';
import { isFreshForegroundDmMessage } from '@/lib/foregroundDmFreshness';
import type { QueryClient } from '@tanstack/react-query';

function messagePreview(message: {
  content?: string | null;
  media_type?: string | null;
}): string {
  if (message.media_type) {
    switch (message.media_type) {
      case 'image':
        return '📷 Photo';
      case 'vybe':
        return '📸 Vybe';
      case 'voice':
        return '🎤 Voice message';
      case 'video':
        return '🎬 Video';
      default:
        return '📎 Media';
    }
  }
  return message.content?.slice(0, 50) || 'New message';
}

async function showWebNotification(
  title: string,
  body: string,
  conversationId: string,
  isGroup: boolean,
) {
  if (isNativePlatform || isDespiaRuntime()) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;

  const tag = `vybe-dm-${conversationId}`;
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag,
        data: {
          url: `/messages/${conversationId}`,
          type: isGroup ? 'group_message' : 'dm',
          conversationId,
          path: `/messages/${conversationId}`,
        },
      });
      return;
    } catch {
      /* fallback below */
    }
  }

  const notification = new Notification(title, {
    body,
    icon: '/icons/icon-192x192.png',
    tag,
  });
  notification.onclick = () => {
    window.focus();
    const route = `/messages/${conversationId}`;
    if (navigationRef.current) navigationRef.current(route);
    else window.location.assign(route);
    notification.close();
  };
}

export async function maybeShowForegroundDmNotification(options: {
  message: Record<string, unknown>;
  profileId: string;
  isViewingConvo: boolean;
  queryClient: QueryClient;
}): Promise<void> {
  const { message, profileId, isViewingConvo, queryClient } = options;
  const conversationId = String(message.conversation_id || '');
  const messageId = String(message.id || '');
  if (!conversationId || !messageId) return;

  if (isViewingConvo && document.visibilityState === 'visible') return;

  // Defense in depth: never toast historical rows that leaked as realtime "INSERT"
  // during listener bootstrap / reconnect.
  if (!isFreshForegroundDmMessage(message.created_at)) return;

  const tag = dmNotificationTag(conversationId, messageId);
  if (!shouldShowInAppNotification(tag)) return;

  const { data: sender } = await db
    .from('profiles')
    .select('username, avatar_url, display_name')
    .eq('id', message.sender_id)
    .maybeSingle();

  const { data: conversation } = await db
    .from('conversations')
    .select('is_group, name')
    .eq('id', conversationId)
    .maybeSingle();

  const senderName = sender?.display_name || sender?.username || 'Someone';
  const preview = messagePreview(message as { content?: string | null; media_type?: string | null });
  const isGroup = !!conversation?.is_group;
  const groupName = conversation?.name || undefined;

  premiumSounds.notification();

  showMessageNotification(
    String(message.sender_id),
    senderName,
    sender?.avatar_url || null,
    preview,
    conversationId,
    messageId,
    (message.content as string | null) ?? null,
    (message.media_url as string | null) ?? null,
    (message.media_type as string | null) ?? null,
  );

  await showWebNotification(
    isGroup ? groupName || 'Group' : senderName,
    isGroup ? `${senderName}: ${preview}` : preview,
    conversationId,
    isGroup,
  );

  queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profileId] });
}
