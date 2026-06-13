import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { useState, useEffect, useCallback } from 'react';
import type { Post } from '@/hooks/useInfinitePosts';
import { refetchFeedOnMount } from '@/lib/queryRefetchPolicy';
import { toast } from 'sonner';

const PAGE_SIZE = 15;
const STALE_TIME = 5 * 60 * 1000;
const RADIUS_MILES = 25;

function transformPost(row: any): Post {
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

export function useUserLocation(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? false;
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(() => {
    try {
      const cached = localStorage.getItem('vybe-user-location');
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    } catch { /* ignore */ }
    return null;
  });
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        localStorage.setItem('vybe-user-location', JSON.stringify({ ...loc, timestamp: Date.now() }));
      },
      (err) => {
        setError(err.message);
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Location access is needed for the Local feed. Please enable it in your browser settings.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 }
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionState(result.state);
        result.addEventListener('change', () => setPermissionState(result.state));
      }).catch(() => {});
    }

    requestLocation();
  }, [enabled, requestLocation]);

  return { location, error, permissionState, requestLocation };
}

/**
 * Local feed - shows posts from users within 25 miles
 * Falls back to trending if no location available
 */
export function useLocalFeed(options?: { enabled?: boolean }) {
  const { profile } = useAuth();
  const profileId = getEffectiveProfileId(profile?.id);
  const feedEnabled = options?.enabled ?? false;
  const { location } = useUserLocation({ enabled: feedEnabled });

  return useInfiniteQuery({
    queryKey: ['local-feed', profileId, location?.lat, location?.lng],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      const offset = pageParam * PAGE_SIZE;

      // If we have location, use the local posts RPC
      if (location) {
        const { data, error } = await supabase.rpc('get_local_posts', {
          p_lat: location.lat,
          p_lng: location.lng,
          p_radius_miles: RADIUS_MILES,
          p_user_id: profileId || null,
          p_offset: offset,
          p_limit: PAGE_SIZE,
        } as any);

        if (error) {
          console.error('[LocalFeed] get_local_posts error, falling back:', error);
          // Fall back to generic feed
          return fetchFallbackFeed(offset, profileId);
        }

        const posts = (data || []).map(transformPost);
        return {
          posts,
          nextPage: posts.length >= PAGE_SIZE ? pageParam + 1 : null,
        };
      }

      // No location available, fall back to generic feed
      return fetchFallbackFeed(offset, profileId);
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: feedEnabled,
    staleTime: STALE_TIME,
    gcTime: 1000 * 60 * 60 * 24 * 14, // 14 days — keep local feed cached for offline
    refetchOnMount: refetchFeedOnMount,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData,
    networkMode: 'always',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

async function fetchFallbackFeed(offset: number, userId?: string): Promise<{ posts: Post[]; nextPage: number | null }> {
  const { data, error } = await supabase.rpc('get_posts_with_counts', {
    p_type: null,
    p_author_id: null,
    p_user_id: userId || null,
    p_offset: offset,
    p_limit: PAGE_SIZE,
  });

  if (error) throw error;
  const posts = (data || []).map(transformPost);
  return {
    posts,
    nextPage: posts.length >= PAGE_SIZE ? (offset / PAGE_SIZE) + 1 : null,
  };
}
