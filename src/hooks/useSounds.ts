import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';

export interface Sound {
  sound_id: string;
  title: string;
  artist: string;
  uploader_id: string;
  audio_url: string;
  preview_url?: string;
  cover_url?: string;
  duration: number;
  waveform_data?: any;
  usage_count: number;
  trend_score: number;
  original_video_id?: string;
  original_creator_id?: string;
  is_extracted: boolean;
  is_original: boolean;
  tags?: string[];
  is_approved: boolean;
  is_explicit: boolean;
  moderation_status: string;
  created_at: string;
  updated_at: string;
  uploader_profile?: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
}

export interface SoundAnalytics {
  plays: number;
  videos_created: number;
  shares: number;
  avg_watch_time: number;
  growth_rate: number;
  plays_last_24h: number;
  plays_last_7d: number;
}

// Get trending sounds
export function useTrendingSounds() {
  return useQuery({
    queryKey: ['sounds', 'trending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sounds')
        .select(`
          *,
          uploader_profile:profiles!uploader_id(id, display_name, avatar_url)
        `)
        .eq('is_approved', true)
        .order('trend_score', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as Sound[];
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get new sounds
export function useNewSounds() {
  return useQuery({
    queryKey: ['sounds', 'new'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sounds')
        .select(`
          *,
          uploader_profile:profiles!uploader_id(id, display_name, avatar_url)
        `)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data as Sound[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

// Get user's saved sounds
export function useSavedSounds() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['sounds', 'saved', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return [];
      
      const { data, error } = await supabase
        .from('user_saved_sounds')
        .select(`
          sound:sounds!inner(
            *,
            uploader_profile:profiles!uploader_id(id, display_name, avatar_url)
          )
        `)
        .eq('user_id', profile.user_id);
      
      if (error) throw error;
      return data.map(item => item.sound) as Sound[];
    },
    enabled: !!profile?.user_id,
  });
}

// Get specific sound by ID
export function useSound(soundId: string) {
  return useQuery({
    queryKey: ['sounds', soundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sounds')
        .select(`
          *,
          uploader_profile:profiles!uploader_id(id, display_name, avatar_url)
        `)
        .eq('sound_id', soundId)
        .single();
      
      if (error) throw error;
      return data as Sound;
    },
    enabled: !!soundId,
  });
}

// Get sound analytics
export function useSoundStats(soundId: string) {
  return useQuery({
    queryKey: ['sound-stats', soundId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sound_analytics')
        .select('*')
        .eq('sound_id', soundId)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error) throw error;
      return data as SoundAnalytics;
    },
    enabled: !!soundId,
  });
}

// Get posts using a specific sound
export function usePostsWithSound(soundId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['posts', 'sound', soundId, profile?.id],
    queryFn: async () => {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id,
          type,
          media_url,
          media_urls,
          caption,
          tags,
          created_at,
          author_id,
          is_pinned,
          profiles!author_id(id, username, display_name, avatar_url)
        `)
        .eq('sound_id', soundId)
        .order('created_at', { ascending: false })
        .limit(12);

      if (error) throw error;
      if (!posts?.length) return [];

      let userLikes: string[] = [];
      let userBookmarks: string[] = [];

      if (profile) {
        const postIds = posts.map((p) => p.id);
        const [likesResult, bookmarksResult] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
          supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        ]);
        userLikes = likesResult.data?.map((l) => l.post_id) || [];
        userBookmarks = bookmarksResult.data?.map((b) => b.post_id) || [];
      }

      const postsWithCounts = await Promise.all(
        posts.map(async (post) => {
          const [likesCount, commentsCount] = await Promise.all([
            supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
            supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);

          const authorRow = post.profiles as { id: string; username: string; display_name?: string | null; avatar_url: string | null } | null;

          return {
            id: post.id,
            type: post.type,
            media_url: post.media_url,
            media_urls: post.media_urls,
            caption: post.caption || '',
            tags: post.tags || [],
            created_at: post.created_at,
            author: {
              id: authorRow?.id || post.author_id,
              username: authorRow?.username || 'unknown',
              display_name: authorRow?.display_name,
              avatar_url: authorRow?.avatar_url,
            },
            like_count: likesCount.count || 0,
            comment_count: commentsCount.count || 0,
            is_liked: userLikes.includes(post.id),
            is_bookmarked: userBookmarks.includes(post.id),
            is_pinned: post.is_pinned || false,
          };
        }),
      );

      return postsWithCounts;
    },
    enabled: !!soundId,
  });
}

// Whether the current user has saved a sound
export function useIsSoundSaved(soundId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sound-saved', profile?.user_id, soundId],
    queryFn: async () => {
      if (!profile?.user_id || !soundId) return false;

      const { data, error } = await supabase
        .from('user_saved_sounds')
        .select('id')
        .eq('user_id', profile.user_id)
        .eq('sound_id', soundId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!profile?.user_id && !!soundId,
  });
}

// Save/unsave sound
export function useSaveSound() {
  const { profile } = useAuth();
  
  const saveSound = useCallback(async (soundId: string) => {
    if (!profile?.user_id) throw new Error('Not authenticated');
    
    const { error } = await supabase
      .from('user_saved_sounds')
      .insert({
        user_id: profile.user_id,
        sound_id: soundId
      });
    
    if (error) throw error;
  }, [profile?.user_id]);

  const unsaveSound = useCallback(async (soundId: string) => {
    if (!profile?.user_id) throw new Error('Not authenticated');
    
    const { error } = await supabase
      .from('user_saved_sounds')
      .delete()
      .eq('user_id', profile.user_id)
      .eq('sound_id', soundId);
    
    if (error) throw error;
  }, [profile?.user_id]);

  return { saveSound, unsaveSound };
}

// Track sound play event
export function useTrackSoundPlay() {
  const { profile } = useAuth();
  
  return useCallback(async (soundId: string, context = 'feed', watchDuration = 0) => {
    const { error } = await supabase
      .from('sound_play_events')
      .insert({
        sound_id: soundId,
        user_id: profile?.user_id || null,
        context,
        watch_duration: watchDuration
      });
    
    if (error) console.error('Failed to track sound play:', error);
  }, [profile?.user_id]);
}

// Audio player hook with waveform support
export function useAudioPlayer(audioUrl: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    
    const audio = new Audio(audioUrl);
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl]);

  const play = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  return {
    isPlaying,
    currentTime,
    duration,
    isLoaded,
    play,
    pause,
    seek,
    toggle: isPlaying ? pause : play
  };
}