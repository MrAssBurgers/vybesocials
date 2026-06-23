import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Mic, Square, Send, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';

interface VoiceRecorderProps {
  onRecordingComplete: (blob: Blob) => void;
  onCancel: () => void;
  isUploading?: boolean;
  /** When true, auto-sends on stop (hold-to-record mode) */
  autoSend?: boolean;
  /** When true, recording is locked (user dragged up) - shows send/cancel buttons */
  locked?: boolean;
}

export function VoiceRecorder({ onRecordingComplete, onCancel, isUploading, autoSend, locked }: VoiceRecorderProps) {
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

  const closeAudioContext = useCallback(() => {
    const ctx = audioContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    audioContextRef.current = null;
    ctx.close().catch(() => undefined);
  }, []);

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
      closeAudioContext();
    }
  }, [closeAudioContext]);

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
      closeAudioContext();
    };
  }, [closeAudioContext]);

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

      {/* Record/Stop/Send button — hidden in autoSend mode (unless locked) */}
      {(!autoSend || locked) && (
        <>
          {!audioBlob ? (
            <>
              {locked && isRecording ? (
                /* Locked mode: show send and cancel */
                <div className="flex items-center gap-1.5">
                  <motion.div whileTap={{ scale: 0.9 }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCancel}
                      className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </motion.div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Button
                      size="icon"
                      onClick={() => {
                        stopRecording();
                        // After stop, onstop will fire and auto-send since autoSendRef is true
                      }}
                      className="h-10 w-10 rounded-full"
                    >
                      <Send className="h-5 w-5" />
                    </Button>
                  </motion.div>
                </div>
              ) : (
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
              )}
            </>
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

      {/* In autoSend mode (not locked), show a hint */}
      {autoSend && !locked && isRecording && (
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

// Audio message player — iMessage-style pill with smooth waveform
interface AudioMessageProps {
  src: string;
  duration?: number;
  isOwn?: boolean;
}

function seedFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function waveformFromSrc(src: string, bars: number): number[] {
  let seed = seedFromString(src);
  return Array.from({ length: bars }, () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return 0.12 + ((seed % 1000) / 1000) * 0.88;
  });
}

export function AudioMessage({ src, isOwn }: AudioMessageProps) {
  const isLocal = src?.startsWith('blob:') || src?.startsWith('data:');
  const signedUrl = useFastSignedUrl(isLocal ? null : src);
  const playUrl = isLocal ? src : (signedUrl || src);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformBars = useMemo(() => waveformFromSrc(src, 32), [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    let rafId = 0;
    const tick = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
      if (!audio.paused) rafId = requestAnimationFrame(tick);
    };

    const handlePlay = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    };
    const handlePause = () => cancelAnimationFrame(rafId);
    const handleLoadedMetadata = () => setAudioDuration(audio.duration);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      cancelAnimationFrame(rafId);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      cancelAnimationFrame(rafId);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [playUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !playUrl) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn('[AudioMessage] playback failed:', err);
    }
  };

  const seekToProgress = (pct: number) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const next = Math.max(0, Math.min(1, pct));
    audio.currentTime = next * audio.duration;
    setProgress(next * 100);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const elapsed = (progress / 100) * audioDuration;

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 min-w-[200px] sm:min-w-[220px] max-w-[280px] px-3 py-2.5 rounded-[22px]',
        isOwn
          ? 'bg-gradient-to-br from-violet-600/90 via-fuchsia-600/85 to-pink-500/80 text-white shadow-md shadow-fuchsia-500/10'
          : 'bg-card/90 border border-border/40 text-foreground shadow-sm backdrop-blur-sm',
      )}
    >
      <audio ref={audioRef} src={playUrl || undefined} preload="metadata" playsInline />

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={togglePlay}
        className={cn(
          'relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          isOwn ? 'bg-white/20' : 'bg-primary/15',
        )}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying && (
          <motion.span
            className={cn('absolute inset-0 rounded-full', isOwn ? 'bg-white/25' : 'bg-primary/20')}
            animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        {isPlaying ? (
          <Square className="h-3.5 w-3.5 fill-current relative z-10" />
        ) : (
          <div className="w-0 h-0 border-l-[10px] border-l-current border-y-[6px] border-y-transparent ml-0.5 relative z-10" />
        )}
      </motion.button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          className="flex items-end gap-[2px] h-7 cursor-pointer touch-none"
          role="slider"
          aria-label="Voice message progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekToProgress((e.clientX - rect.left) / rect.width);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            const rect = e.currentTarget.getBoundingClientRect();
            seekToProgress((e.clientX - rect.left) / rect.width);
          }}
        >
          {waveformBars.map((height, i) => {
            const barProgress = (i / waveformBars.length) * 100;
            const isActive = barProgress <= progress;
            return (
              <div
                key={i}
                className={cn(
                  'w-[3px] rounded-full transition-colors duration-75',
                  isOwn
                    ? isActive ? 'bg-white' : 'bg-white/35'
                    : isActive ? 'bg-primary' : 'bg-primary/25',
                )}
                style={{ height: `${Math.max(4, height * 28)}px` }}
              />
            );
          })}
        </div>
        <div className={cn('flex items-center justify-between text-[10px] tabular-nums', isOwn ? 'text-white/75' : 'text-muted-foreground')}>
          <span className="font-medium tracking-wide">Voice</span>
          <span>{formatTime(isPlaying ? elapsed : audioDuration)}</span>
        </div>
      </div>
    </div>
  );
}
