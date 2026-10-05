import { useState, useCallback, useEffect, useRef } from 'react';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { captureSoundActor, forgetCancelledSoundAttempt, publishOriginalSound, soundUploadRequest, type SoundActor, type SoundUploadInput, type SoundUploadReceipt } from '@/lib/soundUploadService';

export function useUploadSound() {
  const { user, profile } = useAuth(); const session = useReportAccountSession(); const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false), [progress, setProgress] = useState(0), [stage, setStage] = useState(''), [error, setError] = useState('');
  const mounted = useRef(false), revision = useRef(0);
  const active = useRef<{ controller: AbortController; actor: SoundActor; receipt?: SoundUploadReceipt } | null>(null);
  useEffect(() => { mounted.current = true; setIsUploading(false); setProgress(0); setError(''); return () => { mounted.current = false; revision.current++; active.current?.controller.abort(); active.current = null; }; }, [session.uid, session.epoch]);
  const uploadSound = useCallback(async (input: SoundUploadInput) => {
    if (active.current) return null;
    const operation = ++revision.current, view = () => { if (!mounted.current || operation !== revision.current) throw new Error('Sound upload view changed.'); };
    let actor: SoundActor;
    try { const current = reportAccountSnapshot(); if (current.uid !== session.uid || current.epoch !== session.epoch || !user || profile?.user_id !== user.id || session.uid !== user.id) throw new Error('Wait for your account to load.'); actor = captureSoundActor(user.id, profile.id, view); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign in to upload audio.'); return null; }
    const controller = new AbortController(); active.current = { actor, controller };
    setIsUploading(true); setError('');
    try {
      const result = await publishOriginalSound(input, actor, controller.signal, (value, label) => { actor.guard(); setProgress(value); setStage(label); }, receipt => { if (active.current?.controller === controller) active.current.receipt = receipt; });
      actor.guard(); queryClient.invalidateQueries({ queryKey: ['sounds'] }); toast.success('Your original sound is published.'); return result;
    } catch (failure) {
      try { actor.guard(); } catch { return null; }
      setError(failure instanceof Error ? failure.message : 'Your sound could not be confirmed. Retry with the same file.'); return null;
    } finally { if (active.current?.controller === controller) active.current = null; try { actor.guard(); setIsUploading(false); } catch { /* Retired view/account. */ } }
  }, [user, profile, session.uid, session.epoch, queryClient]);
  const cancelUpload = useCallback(async () => {
    const current = active.current; if (!current) return;
    current.controller.abort();
    if (current.receipt) {
      try { const result = await soundUploadRequest(current.actor, { action: 'cancel', uploadId: current.receipt.uploadId }); current.actor.guard(); if (result.status === 'cancelled') forgetCancelledSoundAttempt(result.uploadId); setError(result.status === 'published' ? 'Your sound was already published. You can find it in My uploads.' : 'Upload cancelled. You can change the file and try again.'); }
      catch { try { current.actor.guard(); setError('Stopped waiting. Check My uploads before retrying if publication was already finishing.'); } catch { /* Retired account. */ } }
    }
  }, []);
  return { uploadSound, cancelUpload, isUploading, progress, stage, error };
}
