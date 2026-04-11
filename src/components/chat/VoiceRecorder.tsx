import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mic, Square, Send, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  onCancel: () => void;
  isUploading?: boolean;
  /** When true, auto-sends on stop (hold-to-record mode) */
  autoSend?: boolean;
}

export function VoiceRecorder({ onRecordingComplete, onCancel, isUploading, autoSend }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(40).fill(0));
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>();
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout>();
  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup audio context for visualization
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 128;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      // Setup media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        if (autoSendRef.current) {
          // In hold-to-record mode, send immediately if recording was >0.3s
          if (blob.size > 0) {
            onRecordingComplete(blob);
          } else {
            onCancel();
          }
        } else {
          setAudioBlob(blob);
        }
      };
      
      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);
      
      // Duration timer
      intervalRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
      
      // Waveform animation
      const updateWaveform = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Sample 40 values from the frequency data
        const samples: number[] = [];
        const step = Math.floor(dataArray.length / 40);
        for (let i = 0; i < 40; i++) {
          samples.push(dataArray[i * step] / 255);
        }
        setWaveformData(samples);
        
        animationRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      onCancel();
    }
  }, [onRecordingComplete, onCancel]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    }
  }, []);

  /** Called externally by hold-to-record to stop and auto-send */
  const stopAndSend = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  // Expose stopAndSend for parent component
  useEffect(() => {
    (window as any).__voiceRecorderStop = stopAndSend;
    return () => { delete (window as any).__voiceRecorderStop; };
  }, [stopAndSend]);

  const handleSend = useCallback(() => {
    if (audioBlob) {
      onRecordingComplete(audioBlob);
    }
  }, [audioBlob, onRecordingComplete]);

  const handleCancel = useCallback(() => {
    stopRecording();
    setAudioBlob(null);
    setDuration(0);
    setWaveformData(new Array(40).fill(0));
    onCancel();
  }, [stopRecording, onCancel]);

  // Auto-start recording when component mounts
  useEffect(() => {
    startRecording();
  }, [startRecording]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl"
    >
      {/* Cancel button */}
      <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleCancel}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </motion.div>

      {/* Waveform visualization */}
      <div className="flex-1 flex items-center gap-0.5 h-8">
        {waveformData.map((value, i) => (
          <motion.div
            key={i}
            className={cn(
              "w-1 rounded-full",
              isRecording ? "bg-destructive" : "bg-primary"
            )}
            animate={{
              height: Math.max(4, value * 28),
            }}
            transition={{ duration: 0.05 }}
          />
        ))}
      </div>

      {/* Duration */}
      <motion.span 
        className={cn(
          "text-sm font-mono min-w-[45px]",
          isRecording && "text-destructive"
        )}
        animate={isRecording ? { opacity: [1, 0.5, 1] } : {}}
        transition={isRecording ? { repeat: Infinity, duration: 1 } : {}}
      >
        {formatDuration(duration)}
      </motion.span>

      {/* Record/Stop/Send button — hidden in autoSend mode since release handles it */}
      {!autoSend && (
        <>
          {!audioBlob ? (
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button
                variant={isRecording ? "destructive" : "default"}
                size="icon"
                onClick={isRecording ? stopRecording : startRecording}
                className="h-10 w-10 rounded-full"
              >
                {isRecording ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Mic className="h-5 w-5" />
                )}
              </Button>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.1 }} 
              whileTap={{ scale: 0.9 }}
            >
              <Button
                size="icon"
                onClick={handleSend}
                disabled={isUploading}
                className="h-10 w-10 rounded-full"
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </motion.div>
          )}
        </>
      )}

      {/* In autoSend mode, show a hint */}
      {autoSend && isRecording && (
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-xs text-muted-foreground whitespace-nowrap"
        >
          Release to send
        </motion.div>
      )}

      {/* Recording indicator */}
      <AnimatePresence>
        {isRecording && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.2, 1] }}
            exit={{ scale: 0 }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="absolute top-2 right-2 w-3 h-3 bg-destructive rounded-full"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Audio message player with waveform
interface AudioMessageProps {
  src: string;
  duration?: number;
  isOwn?: boolean;
}

export function AudioMessage({ src, isOwn }: AudioMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate static waveform pattern
  const waveformBars = Array.from({ length: 25 }, () => 0.2 + Math.random() * 0.8);

  return (
    <div className="flex items-center gap-3 min-w-[180px] sm:min-w-[200px] h-auto py-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={togglePlay}
        className={cn(
          "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0",
          isOwn 
            ? "bg-primary-foreground/20 text-primary-foreground" 
            : "bg-primary/20 text-primary"
        )}
      >
        {isPlaying ? (
          <Square className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-current" />
        ) : (
          <div className="w-0 h-0 border-l-[9px] border-l-current border-y-[6px] border-y-transparent ml-0.5" />
        )}
      </motion.button>

      <div className="flex-1 flex flex-col gap-1.5 min-h-[32px]">
        <div className="flex items-center gap-0.5 h-6">
          {waveformBars.map((height, i) => {
            const isActive = (i / waveformBars.length) * 100 <= progress;
            return (
              <div
                key={i}
                className={cn(
                  "w-[3px] sm:w-1 rounded-full transition-colors duration-100",
                  isOwn
                    ? isActive ? "bg-primary-foreground" : "bg-primary-foreground/30"
                    : isActive ? "bg-primary" : "bg-primary/30"
                )}
                style={{ height: `${Math.max(4, height * 100)}%` }}
              />
            );
          })}
        </div>
        <span className={cn(
          "text-[10px] sm:text-xs",
          isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          {formatTime(audioDuration)}
        </span>
      </div>
    </div>
  );
}
