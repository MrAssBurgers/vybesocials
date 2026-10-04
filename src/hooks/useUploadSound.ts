import { useState, useCallback, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

export function useUploadSound() {
  const { user } = useAuth();
  const session = useReportAccountSession();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { setIsUploading(false); setProgress(0); }, [session.uid, session.epoch]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

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

    const account = reportAccountGuard(user.id);
    const guard = () => { account(); if (!mounted.current) throw new Error('Upload view closed.'); };
    try {
      guard();
      setIsUploading(true);
      setProgress(30);

      const { data, error } = await db.functions.invoke('upload-sound', {
        body: { title, tags, duration },
      });
      guard();

      setProgress(80);

      // This endpoint currently has no audio transport. A domain-error object
      // is not a durable upload receipt, even when HTTP transport succeeded.
      if (error || !data || data.ok !== true || typeof data.sound_id !== 'string' || !data.sound_id) {
        toast.message('Sound upload is not available yet. Your file has not been uploaded.');
        return null;
      }
      // Metadata-only requests cannot prove the selected file was stored.
      // Keep this closed until a real binary upload/verified receipt exists.
      toast.message('The audio upload could not be confirmed. Your file is still selected.');
      return null;
    } catch (error: any) {
      try { guard(); } catch { return null; }
      console.error('Upload sound error:', error);
      toast.error(error.message || 'Failed to upload sound');
      return null;
    } finally {
      try { guard(); setIsUploading(false); setProgress(0); } catch { /* Retired account/view. */ }
    }
  }, [user]);

  return { uploadSound, isUploading, progress };
}
