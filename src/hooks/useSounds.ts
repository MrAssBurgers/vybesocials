import { useSocialPostList } from './useSocialPostList';
import { listSavedSounds, getSoundSaved, updateSavedSound } from '@/lib/savedSoundService';
import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { captureSoundActor, readSoundLibrary } from '@/lib/soundUploadService';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { useMusicPlayback } from '@/hooks/useMusicPlayback';
import { db } from '@/lib/firebase';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';

export interface Sound {
  sound_id: string;
  is_saved?: boolean;
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
    queryKey: ['sounds', kind, scope.uid, scope.profileId, scope.epoch], enabled: scope.ready, placeholderData: undefined,
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
    }, staleTime: 0, gcTime: 0, networkMode: 'always', refetchOnMount: 'always', refetchOnReconnect: 'always', refetchInterval: 15000, refetchOnWindowFocus: 'always', retry: false,
  });
  const data = useMemo(() => scope.ready && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData ? query.data : undefined, [scope.ready, query.isFetchedAfterMount, query.isError, query.isPlaceholderData, query.data]);
  return { ...query, data, isLoading: query.isLoading || (scope.ready && !query.isFetchedAfterMount && !query.isError) };
}
// Popularity counters are unavailable: this compatibility hook returns recent originals.
export function useTrendingSounds() { return useLibrary('new'); }
export function useNewSounds() { return useLibrary('new'); }
export function useMySounds() { return useLibrary('mine'); }

/** Keep every loaded row in place without making large legacy cleanup lists
 * exhaust the server's per-account request limit during automatic refresh. */
export const savedSoundsRefreshInterval = (pageCount: number) => Math.max(15000, Math.max(1, pageCount) * 1500);

export function useSavedSounds() {
  const scope = useSoundActor();
  const query = useInfiniteQuery({ queryKey: ['sounds', 'saved', scope.uid, scope.profileId, scope.epoch], enabled: scope.ready, retry: false, placeholderData: undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => listSavedSounds(scopedSoundActor(scope), pageParam),
    getNextPageParam: (last, _pages, _param, params) => last.nextCursor && !params.includes(last.nextCursor) ? last.nextCursor : undefined, staleTime: 0, gcTime: 0, networkMode: 'always', refetchOnMount: 'always', refetchOnReconnect: 'always', refetchInterval: current => savedSoundsRefreshInterval(current.state.data?.pages.length || 1), refetchOnWindowFocus: 'always',
  });
  const repeated = !!query.data?.pages.some((page, index) => page.nextCursor && query.data.pageParams.slice(0, index + 1).includes(page.nextCursor));
  const entries = useMemo(() => scope.ready && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData && !repeated ? query.data?.pages.flatMap(page => page.entries) : undefined, [scope.ready, query.isFetchedAfterMount, query.isError, query.isPlaceholderData, query.data, repeated]);
  const data = useMemo(() => entries?.flatMap(entry => entry.sound ? [entry.sound] : []), [entries]);
  return { ...query, data, entries, isLoading: query.isLoading || (scope.ready && !query.isFetchedAfterMount && !query.isError), isError: query.isError || repeated, error: repeated ? new Error('Saved sound pages repeated. Refresh.') : query.error };
}
export function useSound(soundId: string) {
  const scope = useSoundActor();
  const query = useQuery({ queryKey: ['sounds', 'detail', soundId, scope.uid, scope.profileId, scope.epoch], enabled: scope.ready && !!soundId, placeholderData: undefined,
    queryFn: async () => { if (!/^[a-f0-9]{64}$/.test(soundId)) return null; const result = await readSoundLibrary(scopedSoundActor(scope), { action: 'get', soundId }); return result.sounds[0] || null; },
    staleTime: 0, gcTime: 0, networkMode: 'always', refetchOnMount: 'always', refetchOnReconnect: 'always', refetchInterval: 15000, refetchOnWindowFocus: 'always', retry: false,
  });
  return { ...query, data: scope.ready && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData ? query.data : undefined, isLoading: query.isLoading || (scope.ready && !query.isFetchedAfterMount && !query.isError) };
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
  return useSocialPostList({ scope: 'sound', targetId: soundId }, !!soundId);
}

export function useIsSoundSaved(soundId: string | undefined) {
  const scope = useSoundActor();
  const query = useQuery({ queryKey: ['sounds', 'saved-status', soundId, scope.uid, scope.profileId, scope.epoch],
    enabled: scope.ready && !!soundId, retry: false, staleTime: 0, gcTime: 0, networkMode: 'always', refetchOnMount: 'always', refetchOnReconnect: 'always', refetchInterval: 15000, refetchOnWindowFocus: 'always', placeholderData: undefined,
    queryFn: () => getSoundSaved(scopedSoundActor(scope), soundId!),
  });
  return { ...query, data: scope.ready && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData ? query.data : undefined };
}
export function useSaveSound() {
  const scope = useSoundActor(), client = useQueryClient();
  const mounted = useRef(false), current = useRef(scope); current.current = scope;
  const busy = useRef(false); const [pending, setPending] = useState(false), [error, setError] = useState('');
  useEffect(() => { mounted.current = true; busy.current = false; setPending(false); setError(''); return () => { mounted.current = false; }; }, [scope.uid, scope.epoch, scope.profileId]);
  const update = useCallback(async (input: Parameters<typeof updateSavedSound>[1]) => {
    const view = () => { const now = current.current; if (!mounted.current || now.uid !== scope.uid || now.profileId !== scope.profileId || now.epoch !== scope.epoch) throw new Error('Saved sound view changed.'); };
    if (busy.current) return null;
    let actor: ReturnType<typeof scopedSoundActor>;
    try { if (!scope.ready) throw new Error('Wait for your account to load.'); actor = scopedSoundActor(scope); actor.guard(); view(); }
    catch (failure) { try { view(); const now = reportAccountSnapshot(); if (now.uid === scope.uid && now.epoch === scope.epoch) setError(failure instanceof Error ? failure.message : 'Account unavailable.'); } catch { /* Captured callback belongs to another view. */ } return null; }
    busy.current = true; setPending(true); setError('');
    try {
      const saved = await updateSavedSound(actor, input); actor.guard(); view();
      if (input.action === 'set') client.setQueryData(['sounds', 'saved-status', input.soundId, scope.uid, scope.profileId, scope.epoch], saved);
      void client.invalidateQueries({ queryKey: ['sounds'] }); return saved;
    } catch (failure) { try { actor.guard(); view(); setError(failure instanceof Error ? failure.message : 'Saved sounds could not be updated. Retry.'); } catch { /* Retired view/account. */ } return null; }
    finally { try { actor.guard(); view(); busy.current = false; setPending(false); } catch { /* New view owns its controls. */ } }
  }, [scope.uid, scope.profileId, scope.epoch, scope.ready, client]);
  return { saveSound: (id: string) => update({ action: 'set', soundId: id, saved: true }), unsaveSound: (id: string) => update({ action: 'set', soundId: id, saved: false }), removeLegacy: (id: string) => update({ action: 'removeLegacy', referenceId: id }), pending, error };
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
