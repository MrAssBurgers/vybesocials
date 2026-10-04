import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { updateCustomSounds, clearCustomSound as clearLocalCustomSound, getCustomSounds } from '@/lib/premiumSounds';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';
import { useReportAccountSession } from './useReportAccountSession';

export type SoundType = 'message_tone' | 'call_ringtone';
export interface CustomSound {
  id: string; user_id: string; sound_type: SoundType; file_url: string;
  file_name: string; duration_seconds: number; created_at: string;
}
const DURATION_LIMITS: Record<SoundType, number | null> = { message_tone: 5, call_ringtone: null };

function useSoundActor() {
  const { profile, user } = useAuth();
  const session = useReportAccountSession();
  const profileId = session.uid && user?.id === session.uid && profile?.user_id === session.uid ? profile.id : undefined;
  const lifetime = useRef(0);
  useEffect(() => { lifetime.current++; return () => { lifetime.current++; }; }, [session, profileId]);
  const capture = (requireLifetime = true) => {
    const epoch = lifetime.current;
    const guard = reportAccountGuard(session.uid || '');
    const check = () => {
      guard();
      if (!profileId || reportAccountSnapshot() !== session || (requireLifetime && lifetime.current !== epoch)) throw new Error('Your account changed. Open sound settings again.');
    };
    check(); return check;
  };
  return { session, profileId, capture, key: ['custom-sounds', session.uid, session.epoch, profileId] as const };
}

export function useCustomSounds() {
  const actor = useSoundActor();
  return useQuery({
    queryKey: actor.key,
    queryFn: async () => {
      // A query belongs to this account/epoch, not its first observer's mount.
      // StrictMode remounts and two settings observers may share this request.
      const guard = actor.capture(false);
      const { data, error } = await db.from('user_custom_sounds').select('*').eq('user_id', actor.profileId!);
      guard(); if (error) throw error;
      return (Array.isArray(data) ? data : []).filter((sound): sound is CustomSound =>
        !!sound && sound.user_id === actor.profileId && ['message_tone', 'call_ringtone'].includes(sound.sound_type)
        && typeof sound.file_url === 'string' && typeof sound.file_name === 'string'
        && typeof sound.duration_seconds === 'number' && Number.isFinite(sound.duration_seconds) && sound.duration_seconds > 0);
    },
    enabled: !!actor.profileId, staleTime: 300_000, gcTime: 0,
  });
}

export async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      const duration = audio.duration;
      clearTimeout(timeout);
      audio.removeEventListener('loadedmetadata', loaded);
      audio.removeEventListener('error', failed);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(duration);
    };
    const loaded = () => finish(Number.isFinite(audio.duration) && audio.duration > 0 ? undefined : new Error('Invalid audio duration'));
    const failed = () => finish(new Error('Failed to load audio file'));
    const timeout = setTimeout(() => finish(new Error('Audio metadata timed out')), 15_000);
    audio.addEventListener('loadedmetadata', loaded);
    audio.addEventListener('error', failed);
    audio.preload = 'metadata';
    audio.src = url;
  });
}

export async function validateAudioFile(file: File, soundType: SoundType): Promise<{ valid: boolean; error?: string; duration?: number }> {
  if (!['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'].includes(file.type) && !file.name.match(/\.(mp3|wav|m4a)$/i)) {
    return { valid: false, error: 'Only MP3, WAV, and M4A files are supported' };
  }
  if (!file.size || file.size > 5 * 1024 * 1024) return { valid: false, error: 'Choose a nonempty audio file under 5MB' };
  try {
    const duration = await getAudioDuration(file);
    const limit = DURATION_LIMITS[soundType];
    if (limit !== null && duration > limit) return { valid: false, error: `Duration must be under ${limit} seconds (current: ${duration.toFixed(1)}s)`, duration };
    return { valid: true, duration };
  } catch { return { valid: false, error: 'Failed to read audio file' }; }
}

export function useUploadCustomSound() {
  const actor = useSoundActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, soundType }: { file: File; soundType: SoundType }) => {
      const guard = actor.capture();
      try {
        const validation = await validateAudioFile(file, soundType);
        guard(); if (!validation.valid) throw new Error(validation.error);
        const suffix = file.name.split('.').pop()?.toLowerCase();
        const ext = suffix && ['mp3', 'wav', 'm4a'].includes(suffix) ? suffix
          : ['audio/wav', 'audio/x-wav'].includes(file.type) ? 'wav' : file.type === 'audio/mpeg' ? 'mp3' : 'm4a';
        const contentType = ext === 'wav' ? 'audio/wav' : ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4';
        const filePath = `${actor.session.uid}/${soundType}.${ext}`;
        const { error: uploadError } = await db.storage.from('custom-sounds').upload(filePath, file, { upsert: true, contentType });
        guard(); if (uploadError) throw uploadError;
        const { data: signedData, error: signedError } = await db.storage.from('custom-sounds').createSignedUrl(filePath, 60 * 60 * 24 * 365);
        guard(); if (signedError || !signedData?.signedUrl) throw signedError || new Error('Could not open the uploaded sound. Please try again.');
        // Changing the revision prevents a previously decoded replacement from playing.
        const url = new URL(signedData.signedUrl);
        url.searchParams.set('vybe-tone', crypto.randomUUID());
        const fileUrl = url.href;
        const { data, error } = await db.from('user_custom_sounds').upsert({
          user_id: actor.profileId, sound_type: soundType, file_url: fileUrl,
          file_name: file.name, duration_seconds: validation.duration,
        }, { onConflict: 'user_id,sound_type' }).select().single();
        guard(); if (error) throw error;
        updateCustomSounds({ [soundType]: fileUrl });
        void queryClient.invalidateQueries({ queryKey: actor.key });
        toast.success(`Custom ${soundType === 'message_tone' ? 'message tone' : 'ringtone'} saved!`);
        return data as CustomSound;
      } catch (error) {
        guard();
        toast.error(error instanceof Error ? error.message : 'Failed to upload sound');
        throw error;
      }
    },
  });
}

export function useDeleteCustomSound() {
  const actor = useSoundActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (soundType: SoundType) => {
      const guard = actor.capture();
      try {
        const { error } = await db.from('user_custom_sounds').delete().eq('user_id', actor.profileId!).eq('sound_type', soundType);
        guard(); if (error) throw error;
        clearLocalCustomSound(soundType);
        void queryClient.invalidateQueries({ queryKey: actor.key });
        // Only this owner's known legacy tone paths; never remove unknown records.
        for (const ext of ['mp3', 'wav', 'm4a']) {
          guard();
          await db.storage.from('custom-sounds').remove([`${actor.session.uid}/${soundType}.${ext}`]);
          guard();
        }
        toast.success(`Custom ${soundType === 'message_tone' ? 'message tone' : 'ringtone'} removed`);
        return soundType;
      } catch (error) {
        guard(); toast.error(error instanceof Error ? error.message : 'Failed to remove sound'); throw error;
      }
    },
  });
}

export function useSyncCustomSounds() {
  const actor = useSoundActor();
  const query = useCustomSounds();
  useEffect(() => {
    if (!actor.profileId || !query.isSuccess || !query.data || query.isPlaceholderData) return;
    // A render can belong to the previous actor by the time passive effects run.
    // Refuse that sync without turning an ordinary account switch into a crash.
    try { actor.capture()(); } catch { return; }
    const local = getCustomSounds();
    for (const type of ['message_tone', 'call_ringtone'] as const) {
      const tone = query.data.find(sound => sound.sound_type === type);
      if (tone && local[type] !== tone.file_url) updateCustomSounds({ [type]: tone.file_url });
      else if (!tone && local[type]) clearLocalCustomSound(type);
    }
  }, [actor.session, actor.profileId, query.data, query.isSuccess, query.isPlaceholderData]);
  return query.data;
}
