import { useState, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Upload, Music, Film, Check, AlertTriangle, X, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { scanVideo as nsfwScanVideo } from '@/lib/nsfwScanner';
import { cn } from '@/lib/utils';

interface VideoUploadScannerProps {
  file: File;
  onComplete: (result: { success: boolean; mediaUrl?: string; error?: string }) => void;
  onCancel: () => void;
}

type ScanStep = 'uploading' | 'scanning-video' | 'scanning-audio' | 'finalizing' | 'complete' | 'blocked';

interface ScanState {
  step: ScanStep;
  progress: number;
  uploadProgress: number;
  videoScanResult?: 'safe' | 'warned' | 'blocked';
  audioScanResult?: 'safe' | 'warned' | 'blocked';
  blockReason?: string;
}

const STEP_INFO: Record<ScanStep, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  'uploading': { label: 'Uploading video...', icon: Upload },
  'scanning-video': { label: 'Scanning video content...', icon: Film },
  'scanning-audio': { label: 'Scanning audio...', icon: Music },
  'finalizing': { label: 'Finalizing...', icon: Shield },
  'complete': { label: 'Ready to post!', icon: Check },
  'blocked': { label: 'Content flagged', icon: AlertTriangle },
};

/**
 * Video Upload Scanner - Uploads and scans videos for safety
 * 
 * Flow:
 * 1. Upload to private/quarantine location
 * 2. Scan video frames for inappropriate content
 * 3. Scan audio for hate speech/slurs
 * 4. If safe, finalize and return URL
 * 5. If blocked, delete and show error
 */
export const VideoUploadScanner = memo(function VideoUploadScanner({
  file,
  onComplete,
  onCancel,
}: VideoUploadScannerProps) {
  const [state, setState] = useState<ScanState>({
    step: 'uploading',
    progress: 0,
    uploadProgress: 0,
  });

  const processVideo = useCallback(async () => {
    try {
      // Step 1: Upload to quarantine bucket
      setState(s => ({ ...s, step: 'uploading', progress: 10 }));
      
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const quarantinePath = `quarantine/${fileName}`;
      
      // Upload with progress tracking
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')
        .upload(quarantinePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;
      
      setState(s => ({ ...s, uploadProgress: 100, progress: 30 }));

      // Step 2: Scan video frames (client-side NSFWJS)
      setState(s => ({ ...s, step: 'scanning-video', progress: 40 }));
      
      let videoResult: string = 'safe';
      let videoMessage: string = '';
      try {
        const scanResult = await nsfwScanVideo(file);
        videoResult = scanResult.result === 'blocked' ? 'blocked' : scanResult.result === 'warned' ? 'warned' : 'safe';
        videoMessage = scanResult.message;
      } catch (err) {
        console.error('Video scan error:', err);
      }

      setState(s => ({ ...s, videoScanResult: videoResult as any, progress: 60 }));

      // Check if video content is blocked
      if (videoResult === 'blocked') {
        setState(s => ({ 
          ...s, 
          step: 'blocked', 
          blockReason: videoMessage || 'Video contains inappropriate content',
          progress: 100 
        }));
        
        await supabase.storage.from('media').remove([quarantinePath]);
        return;
      }

      // Step 3: Scan audio (if video has audio)
      setState(s => ({ ...s, step: 'scanning-audio', progress: 70 }));
      
      const { data: audioScanData, error: audioScanError } = await supabase.functions.invoke('scan-video-safety', {
        body: { 
          storagePath: quarantinePath,
          scanType: 'audio'
        },
      });

      if (audioScanError) {
        console.error('Audio scan error:', audioScanError);
        // On error, proceed with caution
      }

      const audioResult = audioScanData?.result || 'safe';
      setState(s => ({ ...s, audioScanResult: audioResult, progress: 85 }));

      // Check if audio contains hate speech
      if (audioResult === 'blocked') {
        setState(s => ({ 
          ...s, 
          step: 'blocked', 
          blockReason: audioScanData?.message || 'Audio contains prohibited content',
          progress: 100 
        }));
        
        // Delete the quarantined file
        await supabase.storage.from('media').remove([quarantinePath]);
        
        return;
      }

      // Step 4: Move to public location
      setState(s => ({ ...s, step: 'finalizing', progress: 90 }));
      
      const publicPath = `videos/${fileName}`;
      
      // Copy to public location (Supabase doesn't have a move function)
      const { data: fileData } = await supabase.storage
        .from('media')
        .download(quarantinePath);
      
      if (fileData) {
        await supabase.storage
          .from('media')
          .upload(publicPath, fileData, {
            cacheControl: '3600',
            upsert: true,
          });
        
        // Delete quarantine copy
        await supabase.storage.from('media').remove([quarantinePath]);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(publicPath);

      setState(s => ({ ...s, step: 'complete', progress: 100 }));

      // Wait for animation
      setTimeout(() => {
        onComplete({ success: true, mediaUrl: urlData.publicUrl });
      }, 1000);

    } catch (error: any) {
      console.error('Video processing error:', error);
      setState(s => ({ 
        ...s, 
        step: 'blocked', 
        blockReason: 'Failed to process video. Please try again.',
        progress: 100 
      }));
    }
  }, [file, onComplete]);

  // Start processing on mount
  useEffect(() => {
    processVideo();
  }, [processVideo]);

  const StepIcon = STEP_INFO[state.step].icon;
  const isBlocked = state.step === 'blocked';
  const isComplete = state.step === 'complete';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-xl p-6"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="max-w-sm w-full"
      >
        <div className="liquid-glass-card rounded-3xl p-8 text-center space-y-6">
          {/* Icon */}
          <motion.div
            className={cn(
              "w-20 h-20 mx-auto rounded-full flex items-center justify-center",
              isBlocked && "bg-red-500/20",
              isComplete && "bg-green-500/20",
              !isBlocked && !isComplete && "bg-primary/20"
            )}
            animate={!isBlocked && !isComplete ? {
              scale: [1, 1.05, 1],
              boxShadow: [
                '0 0 0 0 hsl(var(--primary) / 0.2)',
                '0 0 0 20px hsl(var(--primary) / 0)',
              ],
            } : undefined}
            transition={{ duration: 1.5, repeat: !isBlocked && !isComplete ? Infinity : 0 }}
          >
            <StepIcon className={cn(
              "h-10 w-10",
              isBlocked && "text-red-500",
              isComplete && "text-green-500",
              !isBlocked && !isComplete && "text-primary"
            )} />
          </motion.div>

          {/* Status */}
          <div>
            <h3 className={cn(
              "text-lg font-semibold mb-1",
              isBlocked && "text-red-500",
              isComplete && "text-green-500"
            )}>
              {STEP_INFO[state.step].label}
            </h3>
            
            {isBlocked && state.blockReason && (
              <p className="text-sm text-muted-foreground mt-2">
                {state.blockReason}
              </p>
            )}
          </div>

          {/* Progress bar */}
          {!isBlocked && !isComplete && (
            <div className="space-y-2">
              <Progress value={state.progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {state.progress}% complete
              </p>
            </div>
          )}

          {/* Step indicators */}
          {!isBlocked && !isComplete && (
            <div className="flex justify-center gap-2">
              {(['uploading', 'scanning-video', 'scanning-audio', 'finalizing'] as ScanStep[]).map((step, i) => {
                const stepIndex = ['uploading', 'scanning-video', 'scanning-audio', 'finalizing'].indexOf(state.step);
                const isActive = step === state.step;
                const isCompleted = i < stepIndex;
                
                return (
                  <motion.div
                    key={step}
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isActive && "bg-primary",
                      isCompleted && "bg-primary/50",
                      !isActive && !isCompleted && "bg-muted"
                    )}
                    animate={isActive ? { scale: [1, 1.3, 1] } : undefined}
                    transition={{ duration: 0.6, repeat: Infinity }}
                  />
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {isBlocked ? (
              <>
                <Button variant="outline" className="flex-1" onClick={onCancel}>
                  Choose Different
                </Button>
              </>
            ) : !isComplete ? (
              <Button variant="ghost" className="w-full" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </div>

          {/* Safety message */}
          {!isBlocked && (
            <p className="text-xs text-muted-foreground">
              {isComplete 
                ? 'Your video is ready to share! ✨' 
                : 'Keeping VYBE safe for everyone 💙'}
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
});
