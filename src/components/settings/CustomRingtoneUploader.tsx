import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Play, Pause, Trash2, Music, Phone, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  useCustomSounds, 
  useUploadCustomSound, 
  useDeleteCustomSound,
  validateAudioFile,
  type SoundType 
} from '@/hooks/useCustomSounds';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useSoundPreview } from '@/hooks/useSoundPreview';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { getSoundSettings } from '@/lib/premiumSounds';
import { subscribeDevicePreference } from '@/lib/devicePreferences';

interface CustomRingtoneUploaderProps {
  soundType: SoundType;
  title: string;
  description: string;
  maxDuration: number | null; // null = no limit
}

export function CustomRingtoneUploader(props: CustomRingtoneUploaderProps) {
  const session = useReportAccountSession();
  return <CustomRingtoneForSession key={`${session.uid}:${session.epoch}:${props.soundType}`} {...props} />;
}

function CustomRingtoneForSession({
  soundType,
  title,
  description,
  maxDuration,
}: CustomRingtoneUploaderProps) {
  const { data: sounds } = useCustomSounds();
  const uploadSound = useUploadCustomSound();
  const deleteSound = useDeleteCustomSound();
  
  const preview = useSoundPreview();
  const [settings, setSettings] = useState(getSoundSettings);
  const category = soundType === 'call_ringtone' ? 'calls' : 'messages';
  const enabled = settings.master && settings[category] && settings.volume > 0;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selection = useRef(0);
  useEffect(() => () => { selection.current++; }, []);
  useEffect(() => subscribeDevicePreference('vybe-sound-settings', () => setSettings(getSoundSettings())), []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  
  const existingSound = sounds?.find(s => s.sound_type === soundType);
  
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = ++selection.current;
    preview.stop();
    setSelectedFile(null); setPreviewUrl(null); setDuration(null);
    haptics.tap();
    setValidationError(null);
    
    const validation = await validateAudioFile(file, soundType);
    if (selection.current !== token) return;
    
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid file');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    
    setSelectedFile(file);
    setDuration(validation.duration || null);
    setPreviewUrl(URL.createObjectURL(file));
  }, [soundType, preview.stop]);
  
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    const token = selection.current;
    preview.stop();
    haptics.tap();
    
    try {
      await uploadSound.mutateAsync({ file: selectedFile, soundType });
      if (selection.current !== token) return;
      setSelectedFile(null);
      setPreviewUrl(null);
      setDuration(null);
    } catch (error) {
      // Error handled by mutation
    }
  }, [selectedFile, soundType, uploadSound, preview.stop]);
  
  const handleDelete = useCallback(async () => {
    haptics.tap();
    preview.stop();
    try { await deleteSound.mutateAsync(soundType); } catch { /* Mutation keeps the error visible through its toast. */ }
  }, [soundType, deleteSound, preview.stop]);
  
  const handleCancel = useCallback(() => {
    selection.current++;
    preview.stop();
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    setDuration(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [preview.stop]);
  
  const audioSrc = previewUrl || existingSound?.file_url;
  useEffect(() => { preview.stop(); }, [audioSrc, preview.stop]);
  
  return (
    <div className="settings-panel rounded-xl">
      <div className="flex items-start gap-3 mb-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          soundType === 'message_tone' ? "bg-blue-500/10" : "bg-green-500/10"
        )}>
          {soundType === 'message_tone' ? (
            <Music className="w-5 h-5 text-blue-500" />
          ) : (
            <Phone className="w-5 h-5 text-green-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      
      {/* Validation error */}
      <AnimatePresence>
        {validationError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs"
          >
            {validationError}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Existing sound or selected file preview */}
      {(existingSound || selectedFile) && !validationError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 p-3 rounded-lg bg-background border border-border/50 flex items-center gap-3"
        >
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 rounded-full bg-primary/10 hover:bg-primary/20"
            aria-label={preview.state === 'idle' ? `Preview ${title}` : `Stop ${title} preview`}
            disabled={!enabled && preview.state === 'idle'}
            onClick={() => {
              haptics.tap();
              if (preview.state !== 'idle') preview.stop();
              else if (audioSrc) void preview.play(audioSrc, category);
            }}
          >
            {preview.state !== 'idle' ? (
              <Pause className="h-4 w-4 text-primary" />
            ) : (
              <Play className="h-4 w-4 text-primary ml-0.5" />
            )}
          </Button>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {selectedFile?.name || existingSound?.file_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {duration?.toFixed(1) || existingSound?.duration_seconds?.toFixed(1)}s
            </p>
          </div>
          
          {selectedFile ? (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-11 w-11"
                aria-label="Cancel selected sound"
                onClick={handleCancel}
                disabled={uploadSound.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="default"
                className="h-11 w-11"
                aria-label="Save selected sound"
                onClick={handleUpload}
                disabled={uploadSound.isPending}
              >
                {uploadSound.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${title}`}
              onClick={handleDelete}
              disabled={deleteSound.isPending}
            >
              {deleteSound.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </motion.div>
      )}
      <p role="status" className="text-xs text-muted-foreground">
        {preview.error || (preview.state === 'loading' ? 'Loading preview…' : preview.state === 'playing' ? 'Playing up to 8 seconds.' : !enabled ? 'Enable this sound category and raise the volume to preview.' : '')}
      </p>
      
      {/* Upload button */}
      {!selectedFile && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            haptics.tap();
            fileInputRef.current?.click();
          }}
        >
          <Upload className="h-4 w-4 mr-2" />
          {existingSound ? 'Change Sound' : 'Upload Sound'}
        </Button>
      )}
      
      {/* File requirements */}
      <p className="text-[10px] text-muted-foreground/70 mt-2 text-center">
        MP3, WAV, or M4A{maxDuration ? ` • Max ${maxDuration}s` : ''} • Under 5MB
      </p>
    </div>
  );
}
