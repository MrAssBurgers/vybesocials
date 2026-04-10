import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type MediaType = 'image' | 'video' | 'gif';

interface UploadResult {
  url: string;
  mediaType: MediaType;
}

export function useAnnouncementUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const detectMediaType = (file: File): MediaType => {
    if (file.type.startsWith('video/')) return 'video';
    if (file.type === 'image/gif') return 'gif';
    return 'image';
  };

  const upload = async (file: File): Promise<UploadResult> => {
    setUploading(true);
    setProgress(0);

    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from('announcements')
        .upload(path, file, { upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('announcements')
        .getPublicUrl(path);

      setProgress(100);
      return {
        url: urlData.publicUrl,
        mediaType: detectMediaType(file),
      };
    } finally {
      setUploading(false);
    }
  };

  const uploadBlob = async (blob: Blob, filename: string): Promise<UploadResult> => {
    setUploading(true);
    setProgress(0);

    try {
      const path = `${Date.now()}-${filename}`;
      const { error } = await supabase.storage
        .from('announcements')
        .upload(path, blob, { upsert: true, contentType: 'image/gif' });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('announcements')
        .getPublicUrl(path);

      setProgress(100);
      return { url: urlData.publicUrl, mediaType: 'gif' };
    } finally {
      setUploading(false);
    }
  };

  return { upload, uploadBlob, uploading, progress, detectMediaType };
}
