import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useUnreadMessagesCount } from '@/hooks/useMessages';
import { useUnreadCount } from '@/hooks/useNotifications';

/**
 * Discord/Snapchat-style Tab Notification Badge
 *
 * Prefixes the current route title with unread counts instead of replacing
 * every route with the bare word "VYBE". Signed-out public pages are never
 * touched, so route SEO titles remain authoritative.
 */

const FALLBACK_TITLE = 'VYBE — The Next Generation Social Platform';
const MAX_DISPLAY_COUNT = 99;
const BADGE_PREFIX_RE = /^(?:\(\d+\+?\)|💬)\s+/;

function withoutUnreadPrefix(title: string): string {
  const clean = title.replace(BADGE_PREFIX_RE, '').trim();
  return clean || FALLBACK_TITLE;
}

export function useTabNotificationBadge() {
  const profileId = useAuthProfileId();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { data: unreadMessages = 0 } = useUnreadMessagesCount();
  const { data: unreadNotifications = 0 } = useUnreadCount();
  const previousCountRef = useRef<number>(0);
  const baseTitleRef = useRef<string>(FALLBACK_TITLE);
  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalUnread = unreadMessages + unreadNotifications;

  useEffect(() => {
    if (flashIntervalRef.current) {
      clearInterval(flashIntervalRef.current);
      flashIntervalRef.current = null;
    }
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }

    // A lazy page can set its metadata after the global badge effect. Observe
    // that title instead of restoring the previous route's captured title.
    if (!profileId) {
      previousCountRef.current = 0;
      return;
    }
    const displayCount = totalUnread > MAX_DISPLAY_COUNT ? `${MAX_DISPLAY_COUNT}+` : String(totalUnread);
    let lastWritten: string | undefined;
    let flash = false;
    const syncTitle = () => {
      if (document.title !== lastWritten) baseTitleRef.current = withoutUnreadPrefix(document.title);
      const base = baseTitleRef.current;
      const next = totalUnread > 0 ? `${flash ? '💬' : `(${displayCount})`} ${base}` : base;
      lastWritten = next;
      if (document.title !== next) document.title = next;
    };
    const observer = new MutationObserver(syncTitle);
    const head = document.head;
    observer.observe(head, { childList: true, subtree: true, characterData: true });
    syncTitle();
    if (totalUnread > previousCountRef.current && previousCountRef.current > 0
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      flashIntervalRef.current = setInterval(() => { flash = !flash; syncTitle(); }, 500);
      flashTimeoutRef.current = setTimeout(() => {
        if (flashIntervalRef.current) clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
        flashTimeoutRef.current = null;
        flash = false;
        syncTitle();
      }, 3000);
    }
    previousCountRef.current = totalUnread;

    return () => {
      observer.disconnect();
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
      }
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
    };
  }, [location.pathname, profileId, totalUnread]);

  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel('tab-badge-consolidated', [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        },
      },
      {
        event: 'UPDATE',
        table: 'conversation_members',
        filter: `user_id=eq.${profileId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
        },
      },
      {
        event: 'UPDATE',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
        callback: () => {
          queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, queryClient]);

  return { totalUnread, unreadMessages, unreadNotifications };
}
