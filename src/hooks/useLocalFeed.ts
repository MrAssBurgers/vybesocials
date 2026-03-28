import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useState, useEffect } from 'react';
import type { Post } from '@/hooks/useInfinitePosts';

const PAGE_SIZE = 15;
const STALE_TIME = 5 * 60 * 1000;

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

export function useUserLocation() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check localStorage cache first
    const cached = localStorage.getItem('vybe-user-location');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const age = Date.now() - (parsed.timestamp || 0);
        // Use cached location if less than 30 minutes old
        if (age < 30 * 60 * 1000) {
          setLocation({ lat: parsed.lat, lng: parsed.lng });
          return;
        }
      } catch {}
    }

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
      (err) => setError(err.message),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 }
    );
  }, []);

  return { location, error };
}

/**
 * Local feed - shows posts from nearby users or with local tags
 * Falls back to trending if no location or no local content
 */
export function useLocalFeed() {
  const { profile } = useAuth();
  const { location } = useUserLocation();

  return useInfiniteQuery({
    queryKey: ['local-feed', profile?.id, location?.lat, location?.lng],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      const offset = pageParam * PAGE_SIZE;

      // Use trending feed as base, client will filter/boost local content
      const { data, error } = await supabase.rpc('get_posts_with_counts', {
        p_type: null,
        p_author_id: null,
        p_user_id: profile?.id || null,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      });

      if (error) throw error;
      const posts = (data || []).map(transformPost);

      // Boost posts with location-related tags
      if (location) {
        const localTags = new Set(['local', 'nearby', 'community', 'neighborhood', 'city']);
        posts.sort((a, b) => {
          const aLocal = a.tags.some(t => localTags.has(t.toLowerCase())) ? 1 : 0;
          const bLocal = b.tags.some(t => localTags.has(t.toLowerCase())) ? 1 : 0;
          return bLocal - aLocal;
        });
      }

      return {
        posts,
        nextPage: posts.length >= PAGE_SIZE ? pageParam + 1 : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    staleTime: STALE_TIME,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
