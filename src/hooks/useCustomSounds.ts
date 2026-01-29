import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { 
  updateCustomSounds, 
  clearCustomSound as clearLocalCustomSound,
  getCustomSounds 
} from '@/lib/premiumSounds';

export type SoundType = 'message_tone' | 'call_ringtone';

export interface CustomSound {
  id: string;
  user_id: string;
  sound_type: SoundType;
  file_url: string;
  file_name: string;
  duration_seconds: number;
  created_at: string;
}

// Duration limits in seconds
const DURATION_LIMITS: Record<SoundType, number> = {
  message_tone: 5,
  call_ringtone: 15,
};

// Fetch user's custom sounds from database
export function useCustomSounds() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['custom-sounds', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      
      const { data, error } = await supabase
        .from('user_custom_sounds')
        .select('*')
        .eq('user_id', profile.id);
      
      if (error) throw error;
      return data as CustomSound[];
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get audio duration from file
export async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
    });
    audio.addEventListener('error', () => {
      reject(new Error('Failed to load audio file'));
    });
    audio.src = URL.createObjectURL(file);
  });
}

// Validate audio file
export async function validateAudioFile(
  file: File, 
  soundType: SoundType
): Promise<{ valid: boolean; error?: string; duration?: number }> {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'audio/m4a'];
  
  if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a)$/i)) {
    return { valid: false, error: 'Only MP3, WAV, and M4A files are supported' };
  }
  
  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be under 5MB' };
  }
  
  try {
    const duration = await getAudioDuration(file);
    const maxDuration = DURATION_LIMITS[soundType];
    
    if (duration > maxDuration) {
      return { 
        valid: false, 
        error: `Duration must be under ${maxDuration} seconds (current: ${duration.toFixed(1)}s)`,
        duration 
      };
    }
    
    return { valid: true, duration };
  } catch {
    return { valid: false, error: 'Failed to read audio file' };
  }
}

// Upload custom sound
export function useUploadCustomSound() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      file, 
      soundType 
    }: { 
      file: File; 
      soundType: SoundType;
    }) => {
      if (!profile?.id || !user?.id) throw new Error('Not authenticated');
      
      // Validate file
      const validation = await validateAudioFile(file, soundType);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      // Upload to storage
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const fileName = `${soundType}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('custom-sounds')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get the URL
      const { data: urlData } = supabase.storage
        .from('custom-sounds')
        .getPublicUrl(filePath);
      
      // For private buckets, we need a signed URL
      const { data: signedData, error: signedError } = await supabase.storage
        .from('custom-sounds')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year
      
      const fileUrl = signedData?.signedUrl || urlData.publicUrl;
      
      // Upsert to database
      const { data, error } = await supabase
        .from('user_custom_sounds')
        .upsert({
          user_id: profile.id,
          sound_type: soundType,
          file_url: fileUrl,
          file_name: file.name,
          duration_seconds: validation.duration || 0,
        }, {
          onConflict: 'user_id,sound_type'
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Update local storage for immediate playback
      updateCustomSounds({
        [soundType]: fileUrl,
      });
      
      return data as CustomSound;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['custom-sounds'] });
      toast.success(`Custom ${data.sound_type === 'message_tone' ? 'message tone' : 'ringtone'} saved!`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload sound');
    },
  });
}

// Delete custom sound
export function useDeleteCustomSound() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (soundType: SoundType) => {
      if (!profile?.id || !user?.id) throw new Error('Not authenticated');
      
      // Delete from database
      const { error } = await supabase
        .from('user_custom_sounds')
        .delete()
        .eq('user_id', profile.id)
        .eq('sound_type', soundType);
      
      if (error) throw error;
      
      // Delete from storage
      const fileExt = 'mp3'; // We'll try common extensions
      const extensions = ['mp3', 'wav', 'm4a'];
      
      for (const ext of extensions) {
        await supabase.storage
          .from('custom-sounds')
          .remove([`${user.id}/${soundType}.${ext}`]);
      }
      
      // Clear local storage
      clearLocalCustomSound(soundType);
      
      return soundType;
    },
    onSuccess: (soundType) => {
      queryClient.invalidateQueries({ queryKey: ['custom-sounds'] });
      toast.success(`Custom ${soundType === 'message_tone' ? 'message tone' : 'ringtone'} removed`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove sound');
    },
  });
}

// Sync custom sounds from database to local storage on load
export function useSyncCustomSounds() {
  const { data: sounds } = useCustomSounds();
  
  // Sync to local storage when sounds load
  if (sounds && sounds.length > 0) {
    const localSounds = getCustomSounds();
    const updates: Record<string, string> = {};
    
    for (const sound of sounds) {
      if (localSounds[sound.sound_type] !== sound.file_url) {
        updates[sound.sound_type] = sound.file_url;
      }
    }
    
    if (Object.keys(updates).length > 0) {
      updateCustomSounds(updates);
    }
  }
  
  return sounds;
}