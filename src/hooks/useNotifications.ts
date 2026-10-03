import { useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { preferredUsername } from '@/lib/displayUser';
import { fetchMemberProfiles, normalizeToProfileId } from '@/lib/dmMembershipRepair';
import {
  buildNotificationRoute,
  navigateFromNotification,
  normalizeNotificationPayload,
} from '@/lib/notificationActions';
import { bellNotificationTag, shouldShowInAppNotification } from '@/lib/inAppNotificationDedupe';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { isNativePlatform } from '@/lib/capacitor';
import { toIsoDateString } from '@/lib/parseApiDate';
import { premiumSounds } from '@/lib/premiumSounds';
import { isRetiredUpgradeNotice } from '@/lib/migrationNotice';

// Check notification permission — never auto-request on web to avoid browser bell prompts
async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  // Don't auto-request — only return current state
  return false;
}

// Show native browser notification
function showNativeNotification(title: string, body: string, url?: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'vybe-notification',
  });

  notification.onclick = () => {
    window.focus();
    if (url) window.location.href = url;
    notification.close();
  };
}

export type NotificationType = 'like' | 'comment' | 'follow' | 'friend_request' | 'friend_accepted' | 'friend_declined' | 'message' | 'mention' | 'missed_call' | 'announcement' | 'content_removed' | 'smart_ping';

/** Types handled elsewhere — no bell toast (DMs → chat list; missed calls → DM thread). */
const SKIP_BELL_TOAST_TYPES = new Set<NotificationType>([
  'message',
  'missed_call',
]);

const SKIP_BELL_TOAST_RAW_TYPES = new Set([
  'security',
  'login_approval',
  'sign_in',
  'sign-in',
  'new_sign_in',
]);

interface Notification {
  id: string;
  type: NotificationType;
  read: boolean;
  created_at: string;
  post_id: string | null;
  reason: string | null;
  // Smart-ping fields
  title?: string | null;
  body?: string | null;
  image_url?: string | null;
  deep_link?: string | null;
  subtype?: string | null;
  meta?: any;
  actor: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useNotifications() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', profileId],
    queryFn: async (): Promise<Notification[]> => {
      if (!profileId) return [];

      // Use a simpler query structure for faster loading
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from('notifications')
        .select(`
          id,
          type,
          read,
          created_at,
          post_id,
          actor_id,
          reason,
          title,
          body,
          image_url,
          deep_link,
          subtype,
          meta
        `)
        .eq('user_id', profileId)
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const sorted = [...data].sort(
        (a, b) =>
          Date.parse(toIsoDateString(b.created_at, '1970-01-01T00:00:00.000Z')) -
          Date.parse(toIsoDateString(a.created_at, '1970-01-01T00:00:00.000Z')),
      );

      // Hide stale Daily Brief pings (>24h old) — they're time-sensitive
      const DAY_MS = 24 * 60 * 60 * 1000;
      const WEEK_MS = 7 * DAY_MS;
      const now = Date.now();
      const filtered = sorted.filter((n: any) => {
        if (isRetiredUpgradeNotice(n)) return false;
        // Missed calls live in the DM thread as call_event rows — not the bell menu
        if (n.type === 'missed_call') return false;
        // DMs belong in Messages — never park message rows in the bell feed
        if (n.type === 'message') return false;
        const age = now - Date.parse(toIsoDateString(n.created_at));
        if (!Number.isFinite(age) || age > WEEK_MS) return false;
        if (n.subtype === 'brief_item') {
          return age < DAY_MS;
        }
        return true;
      });
      if (filtered.length === 0) return [];

      // Batch fetch actor profiles (Firestore `in` max 10) — actor_id may be profile id OR auth uid
      const actorIds = [...new Set(filtered.map((n: any) => n.actor_id).filter(Boolean))];
      const actorMap = await fetchMemberProfiles(actorIds);

      const mapped = filtered.map((n: any) => {
        const profile = actorMap.get(n.actor_id);
        const actor = profile
          ? {
              id: String(profile.id),
              username: String(profile.username || preferredUsername({ username: n.actor_username })),
              avatar_url: (profile.avatar_url as string | null) ?? null,
              display_name: (profile.display_name as string | null) ?? null,
            }
          : {
              id: n.actor_id,
              username: preferredUsername({ username: n.actor_username }),
              avatar_url: null,
              display_name: null,
            };
        return {
          id: n.id,
          type: n.type as NotificationType,
          read: n.read,
          created_at: toIsoDateString(n.created_at),
          post_id: n.post_id,
          reason: n.reason || null,
          title: n.title || null,
          body: n.body || null,
          image_url: n.image_url || null,
          deep_link: n.deep_link || null,
          subtype: n.subtype || null,
          meta: n.meta || null,
          actor: {
            ...actor,
            username: preferredUsername(actor),
          },
        };
      });
      return mapped;
    },
    enabled: !!profileId,
    select: (notifications) => notifications.filter(n => !isRetiredUpgradeNotice(n)),
    staleTime: 60000, // Cache for 1 minute
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    networkMode: 'always',
  });

  // Subscribe to real-time notifications
  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel(`notifications:${profileId}`, [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
        callback: async (payload) => {
          if (isRetiredUpgradeNotice(payload.new)) return;
          const row = payload.new as { actor_id?: string; created_at?: string; read?: boolean };
          if (row.actor_id === profileId) return;

          // Only toast genuinely new notifications (not stale rows synced later).
          const createdMs = row.created_at ? Date.parse(row.created_at) : 0;
          if (!createdMs || Date.now() - createdMs > 45_000) return;

          const { data: actor } = await db
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.actor_id)
            .single();

          const type = payload.new.type as NotificationType;
          const rawType = String(payload.new.type || '').toLowerCase();
          if (SKIP_BELL_TOAST_TYPES.has(type) || SKIP_BELL_TOAST_RAW_TYPES.has(rawType)) {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
            return;
          }

          // Sign-in alerts without an actor are account-security events — LoginApprovalSheet handles those.
          if (!payload.new.actor_id && (rawType.includes('sign') || rawType.includes('login') || rawType.includes('security'))) {
            return;
          }

          const notificationId = String(payload.new.id || '');
          if (notificationId && !shouldShowInAppNotification(bellNotificationTag(type, notificationId))) {
            return;
          }

          if (type === 'like') {
            premiumSounds.likeNotification();
          } else if (type === 'comment') {
            premiumSounds.commentNotification();
          } else {
            premiumSounds.vybeNotification();
          }

          const messages: Record<NotificationType, string> = {
            like: 'liked your post',
            comment: 'commented on your post',
            follow: 'started following you',
            friend_request: 'sent you a friend request',
            friend_accepted: 'accepted your friend request',
            friend_declined: 'declined your friend request',
            message: 'sent you a message',
            mention: 'mentioned you',
            missed_call: 'tried to call you',
            announcement: 'posted an announcement',
            content_removed: 'removed your content',
            smart_ping: 'sent you a smart ping',
          };

          const message = `${actor?.username || 'Someone'} ${messages[type] || 'interacted with you'}`;

          const route = buildNotificationRoute(
            normalizeNotificationPayload({
              type,
              postId: payload.new.post_id,
              post_id: payload.new.post_id,
              deepLink: payload.new.deep_link,
              path: payload.new.deep_link,
            }) || { type, action: 'open' },
          );

          toast.info(message, {
            duration: 4000,
            action: {
              label: 'View',
              onClick: () => navigateFromNotification(route),
            },
          });

          if (document.hidden && !isNativePlatform && !isDespiaRuntime()) {
            showNativeNotification('VYBE', message, route);
          }

          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, queryClient]);

  return query;
}

export function useMarkNotificationsRead() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!profileId) return;

      await db
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profileId)
        .eq('read', false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    },
  });
}

export function useUnreadCount() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['unread-notifications', profileId, 'retired-upgrade-filtered'],
    queryFn: async () => {
      if (!profileId) return 0;

      const { data, error } = await db
        .from('notifications')
        .select('id,type,title')
        .eq('user_id', profileId)
        .eq('read', false);

      if (error) throw error;
      return (data || []).filter(n => !isRetiredUpgradeNotice(n)).length;
    },
    enabled: !!profileId,
    staleTime: 60000, // Cache for 1 minute
    gcTime: 1000 * 60 * 10,
    refetchInterval: 60000, // Poll every minute instead of 30s
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function usePendingFriendRequestCount() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['pending-friend-requests-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count } = await db
        .from('friend_requests')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', profileId)
        .eq('status', 'pending');

      return count || 0;
    },
    enabled: !!profileId,
    staleTime: 30000,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}
