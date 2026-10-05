import { readCommentCounts } from '@/lib/commentService';
import { useCallback, useMemo } from 'react';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { captureSoundActor, readSoundLibrary } from '@/lib/soundUploadService';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { useMusicPlayback } from '@/hooks/useMusicPlayback';
import { db } from '@/lib/firebase';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

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

function useSoundActor() {
  const { user, profile } = useAuth(); const session = useReportAccountSession();
  const ready = !!user && profile?.user_id === user.id && session.uid === user.id;
  return { uid: ready ? user.id : '', profileId: ready ? profile.id : '', epoch: session.epoch, ready };
}
function scopedSoundActor(scope: { uid: string; profileId: string; epoch: number }) {
  return captureSoundActor(scope.uid, scope.profileId, () => { const current = reportAccountSnapshot(); if (current.uid !== scope.uid || current.epoch !== scope.epoch) throw new Error('Sound account changed.'); });
}
function useLibrary(kind: 'new' | 'trending' | 'mine') {
  const scope = useSoundActor();
  const query = useQuery({
    queryKey: ['sounds', kind, scope.uid, scope.profileId, scope.epoch], enabled: scope.ready,
    queryFn: async () => {
      const actor = scopedSoundActor(scope); const sounds: Sound[] = []; let cursor: string | undefined;
      const seen = new Set<string>();
      for (let page = 0; page < 4; page++) {
        const result = await readSoundLibrary(actor, { action: 'list', kind, ...(cursor ? { cursor } : {}) });
        sounds.push(...result.sounds); if (!result.nextCursor) return sounds;
        if (seen.has(result.nextCursor)) throw new Error('Sound pages repeated. Refresh and retry.');
        seen.add(result.nextCursor); cursor = result.nextCursor;
      }
      return sounds; // The browser intentionally shows at most 100 recent entries.
    }, staleTime: 0, refetchInterval: 15000, refetchOnWindowFocus: 'always', retry: false,
  });
  const data = useMemo(() => scope.ready && !query.isError ? query.data : undefined, [scope.ready, query.isError, query.data]);
  return { ...query, data };
}
// Popularity counters are unavailable: this compatibility hook returns recent originals.
export function useTrendingSounds() { return useLibrary('new'); }
export function useNewSounds() { return useLibrary('new'); }
export function useMySounds() { return useLibrary('mine'); }

export function useSavedSounds() {
  const scope = useSoundActor();
  return useQuery({ queryKey: ['sounds', 'saved', scope.uid, scope.epoch], enabled: scope.ready, retry: false,
    queryFn: async () => {
      const actor = scopedSoundActor(scope);
      const { data, error } = await db.from('user_saved_sounds').select('sound_id').eq('user_id', scope.uid).limit(50); actor.guard();
      if (error) throw error;
      const sounds: Sound[] = [];
      for (const entry of data || []) { if (typeof entry.sound_id !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sound_id)) continue; const result = await readSoundLibrary(actor, { action: 'get', soundId: entry.sound_id }); sounds.push(...result.sounds); }
      return sounds;
    },
  });
}
export function useSound(soundId: string) {
  const scope = useSoundActor();
  const query = useQuery({ queryKey: ['sounds', 'detail', soundId, scope.uid, scope.profileId, scope.epoch], enabled: scope.ready && !!soundId,
    queryFn: async () => { if (!/^[a-f0-9]{64}$/.test(soundId)) return null; const result = await readSoundLibrary(scopedSoundActor(scope), { action: 'get', soundId }); return result.sounds[0] || null; },
    staleTime: 0, refetchInterval: 15000, refetchOnWindowFocus: 'always', retry: false,
  });
  return { ...query, data: scope.ready && !query.isError ? query.data : undefined };
}

// Get sound analytics
export function useSoundStats(soundId: string) {
  return useQuery({
    queryKey: ['sound-stats', soundId],
    queryFn: async () => {
      const { data, error } = await db
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
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['posts', 'sound', soundId, profileId],
    queryFn: async () => {
      const { data: posts, error } = await db
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

      if (profileId) {
        const postIds = posts.map((p) => p.id);
        const [likesResult, bookmarksResult] = await Promise.all([
          db.from('likes').select('post_id').eq('user_id', profileId).in('post_id', postIds),
          db.from('bookmarks').select('post_id').eq('user_id', profileId).in('post_id', postIds),
        ]);
        userLikes = likesResult.data?.map((l) => l.post_id) || [];
        userBookmarks = bookmarksResult.data?.map((b) => b.post_id) || [];
      }

      const commentCounts = await readCommentCounts(posts.map(post => post.id), profileId);
      const postsWithCounts = await Promise.all(
        posts.map(async (post) => {
          const [likesCount] = await Promise.all([
            db.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', post.id),

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
            comment_count: commentCounts[post.id] ?? 0,
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
  const { profile, user } = useAuth();
  const authUserId = profile?.user_id || user?.id;

  return useQuery({
    queryKey: ['sound-saved', authUserId, soundId],
    queryFn: async () => {
      if (!authUserId || !soundId) return false;

      const { data, error } = await db
        .from('user_saved_sounds')
        .select('id')
        .eq('user_id', authUserId)
        .eq('sound_id', soundId)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!authUserId && !!soundId,
  });
}

// Save/unsave sound
export function useSaveSound() {
  const { profile } = useAuth();
  
  const saveSound = useCallback(async (soundId: string) => {
    if (!profile?.user_id) throw new Error('Not authenticated');
    
    const { error } = await db
      .from('user_saved_sounds')
      .insert({
        user_id: profile.user_id,
        sound_id: soundId
      });
    
    if (error) throw error;
  }, [profile?.user_id]);

  const unsaveSound = useCallback(async (soundId: string) => {
    if (!profile?.user_id) throw new Error('Not authenticated');
    
    const { error } = await db
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
    const { error } = await db
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

// Existing sound surfaces share the checked, explicitly started media player.
export function useAudioPlayer(audioUrl: string, soundId?: string) {
  const scope = useSoundActor();
  const authorize = useCallback(async () => {
    if (!soundId || !scope.ready || reportAccountSnapshot().epoch !== scope.epoch) throw new Error('Sound account changed.');
    const result = await readSoundLibrary(scopedSoundActor(scope), { action: 'get', soundId });
    if (!result.sounds[0] || result.sounds[0].audio_url !== audioUrl) throw new Error('This sound is no longer available.');
  }, [scope.uid, scope.profileId, scope.ready, scope.epoch, soundId, audioUrl]);
  return useMusicPlayback(audioUrl, 60, authorize);
}
