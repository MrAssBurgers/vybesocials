import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export function useUploadSound() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadSound = useCallback(async ({
    file,
    title,
    tags = [],
    duration = 0,
  }: {
    file: File;
    title: string;
    tags?: string[];
    duration?: number;
  }) => {
    if (!user) {
      toast.error('Please sign in to upload sounds');
      return null;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File too large (max 20MB)');
      return null;
    }

    setIsUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('title', title);
      formData.append('tags', tags.join(','));
      formData.append('duration', duration.toString());

      setProgress(30);

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-sound`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      setProgress(80);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Upload failed');
      }

      const result = await response.json();
      setProgress(100);

      // Invalidate sounds queries to show the new sound
      queryClient.invalidateQueries({ queryKey: ['sounds'] });

      toast.success('Sound uploaded! +10 XP 🎵');
      return result;
    } catch (error: any) {
      console.error('Upload sound error:', error);
      toast.error(error.message || 'Failed to upload sound');
      return null;
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  }, [user, queryClient]);

  return { uploadSound, isUploading, progress };
}
