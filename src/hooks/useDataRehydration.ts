/**
 * Data Rehydration Hook
 * 
 * Utility hook for manually triggering data rehydration.
 * Primary rehydration is handled by AppReadinessGate.
 * This hook is for manual refresh scenarios.
 * 
 * Features:
 * - Per-request timeouts to prevent hangs
 * - Graceful fallbacks on failures
 * - No crashes or forced logouts on backend errors
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RehydrationStatus = 'idle' | 'loading' | 'success' | 'error';

export interface RehydrationState {
  status: RehydrationStatus;
  step: string;
  progress: number;
  error: string | null;
}

const DEFAULT_TIMEOUT_MS = 8000;

// Wrap promise with timeout
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

// Retry once on failure
async function retryOnce<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

// Safe wrapper that never throws - always returns fallback on error
async function safe<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  try {
    return await retryOnce(label, () => withTimeout(fn(), timeoutMs, label));
  } catch (e) {
    console.warn(`[Rehydration] ${label} failed (using fallback):`, e);
    return fallback;
  }
}

function transformPost(row: any) {
  return {
    id: row.id,
    type: row.type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || '',
    tags: row.tags || [],
    created_at: row.created_at,
    is_pinned: row.is_pinned,
    author: {
      id: row.author_id,
      username: row.author_username,
      avatar_url: row.author_avatar_url,
    },
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    is_liked: row.is_liked || false,
    is_bookmarked: row.is_bookmarked || false,
  };
}

export function useDataRehydration() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<RehydrationState>({
    status: 'idle',
    step: '',
    progress: 0,
    error: null,
  });
  const inFlightRef = useRef(false);

  /**
   * Rehydrate all user data for a given profile.
   * Returns true on success, false on failure.
   */
  const rehydrate = useCallback(async (
    userId: string,
    profileId: string,
    profile: any
  ): Promise<boolean> => {
    if (inFlightRef.current) {
      console.log('[Rehydration] Already in progress, skipping');
      return false;
    }

    inFlightRef.current = true;
    setState({ status: 'loading', step: 'Loading your data...', progress: 10, error: null });

    try {
      // Cache profile immediately
      queryClient.setQueryData(['profile', userId], profile);

      setState(s => ({ ...s, step: 'Loading friends...', progress: 25 }));

      // Load all core data in parallel with safe fallbacks
      await Promise.allSettled([
        // Friends
        safe('friends', async () => {
          const [asSender, asReceiver] = await Promise.all([
            supabase
              .from('friend_requests')
              .select('receiver:profiles!receiver_id(id, username, avatar_url, display_name)')
              .eq('sender_id', profileId)
              .eq('status', 'accepted'),
            supabase
              .from('friend_requests')
              .select('sender:profiles!sender_id(id, username, avatar_url, display_name)')
              .eq('receiver_id', profileId)
              .eq('status', 'accepted'),
          ]);
          const friends = [
            ...((asSender.data || []) as any[]).map((r) => r.receiver),
            ...((asReceiver.data || []) as any[]).map((r) => r.sender),
          ];
          queryClient.setQueryData(['friends', profileId], friends);
          return friends;
        }, []),

        // Friend requests
        safe('friend-requests', async () => {
          const [incoming, outgoing] = await Promise.all([
            supabase
              .from('friend_requests')
              .select('*, sender:profiles!sender_id(id, username, avatar_url, display_name)')
              .eq('receiver_id', profileId)
              .eq('status', 'pending')
              .order('created_at', { ascending: false }),
            supabase
              .from('friend_requests')
              .select('*, receiver:profiles!receiver_id(id, username, avatar_url, display_name)')
              .eq('sender_id', profileId)
              .eq('status', 'pending')
              .order('created_at', { ascending: false }),
          ]);
          const payload = {
            incoming: (incoming.data || []) as any[],
            outgoing: (outgoing.data || []) as any[],
          };
          queryClient.setQueryData(['friend-requests', profileId], payload);
          return payload;
        }, { incoming: [], outgoing: [] }),

        // Conversations
        safe('conversations', async () => {
          const { data, error } = await supabase
            .from('conversations')
            .select(`*,
              members:conversation_members(
                user_id, role, is_muted, is_pinned, last_read_at,
                profile:profiles(id, username, avatar_url, display_name)
              )`)
            .order('updated_at', { ascending: false });
          if (error) throw error;
          queryClient.setQueryData(['conversations', profileId], data || []);
          return data || [];
        }, []),

        // Notifications
        safe('notifications', async () => {
          const { data } = await supabase
            .from('notifications')
            .select('id, type, read, created_at, post_id, actor_id')
            .eq('user_id', profileId)
            .order('created_at', { ascending: false })
            .limit(30);
          queryClient.setQueryData(['notifications', profileId], data || []);
          const unread = (data || []).filter((n: any) => !n.read).length;
          queryClient.setQueryData(['unread-notifications', profileId], unread);
          return data || [];
        }, []),

        // Posts
        safe('posts', async () => {
          const { data, error } = await supabase.rpc('get_posts_with_counts', {
            p_type: null,
            p_author_id: null,
            p_user_id: profileId,
            p_offset: 0,
            p_limit: 50,
          });
          if (error) throw error;
          const posts = (data || []).map(transformPost);
          queryClient.setQueryData(['infinite-posts', undefined, undefined, profileId], {
            pages: [{ posts, nextPage: posts.length >= 50 ? 1 : null, totalLoaded: posts.length }],
            pageParams: [0],
          });
          return posts;
        }, []),

        // Stories
        safe('stories', async () => {
          const { data } = await supabase
            .from('stories')
            .select('*, author:profiles!author_id(id, username, avatar_url, display_name)')
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false })
            .limit(50);
          queryClient.setQueryData(['stories', profileId], data || []);
          return data || [];
        }, []),
      ]);

      setState({ status: 'success', step: 'Ready!', progress: 100, error: null });
      inFlightRef.current = false;
      return true;

    } catch (error: any) {
      console.error('[Rehydration] Fatal error:', error);
      setState({
        status: 'error',
        step: 'Failed to load data',
        progress: 0,
        error: error?.message || 'Unknown error',
      });
      inFlightRef.current = false;
      return false;
    }
  }, [queryClient]);

  const reset = useCallback(() => {
    setState({ status: 'idle', step: '', progress: 0, error: null });
    inFlightRef.current = false;
  }, []);

  return { state, rehydrate, reset };
}
