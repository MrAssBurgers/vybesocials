import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Play, Pause, Trash2, Music, Phone, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  useCustomSounds, 
  useUploadCustomSound, 
  useDeleteCustomSound,
  validateAudioFile,
  type SoundType 
} from '@/hooks/useCustomSounds';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface CustomRingtoneUploaderProps {
  soundType: SoundType;
  title: string;
  description: string;
  maxDuration: number | null; // null = no limit
}

export function CustomRingtoneUploader({
  soundType,
  title,
  description,
  maxDuration,
}: CustomRingtoneUploaderProps) {
  const { data: sounds } = useCustomSounds();
  const uploadSound = useUploadCustomSound();
  const deleteSound = useDeleteCustomSound();
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const existingSound = sounds?.find(s => s.sound_type === soundType);
  
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    haptics.tap();
    setValidationError(null);
    
    const validation = await validateAudioFile(file, soundType);
    
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid file');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }
    
    setSelectedFile(file);
    setDuration(validation.duration || null);
    setPreviewUrl(URL.createObjectURL(file));
  }, [soundType]);
  
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    
    haptics.tap();
    
    try {
      await uploadSound.mutateAsync({ file: selectedFile, soundType });
      setSelectedFile(null);
      setPreviewUrl(null);
      setDuration(null);
    } catch (error) {
      // Error handled by mutation
    }
  }, [selectedFile, soundType, uploadSound]);
  
  const handleDelete = useCallback(async () => {
    haptics.tap();
    await deleteSound.mutateAsync(soundType);
  }, [soundType, deleteSound]);
  
  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    setDuration(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);
  
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    
    haptics.tap();
    
    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);
  
  const audioSrc = previewUrl || existingSound?.file_url;
  
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
      
      {/* Audio element for preview */}
      {audioSrc && (
        <audio 
          ref={audioRef} 
          src={audioSrc}
          onEnded={() => setIsPlaying(false)}
          preload="metadata"
        />
      )}
      
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
            className="h-9 w-9 rounded-full bg-primary/10 hover:bg-primary/20"
            onClick={togglePlay}
          >
            {isPlaying ? (
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
                className="h-8 w-8"
                onClick={handleCancel}
                disabled={uploadSound.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="default"
                className="h-8 w-8"
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
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
