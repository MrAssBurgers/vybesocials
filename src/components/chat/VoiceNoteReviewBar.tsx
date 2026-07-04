import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mic, RotateCcw, Send, Trash2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface VoiceNoteReviewBarProps {
  blob: Blob;
  durationSeconds: number;
  isUploading?: boolean;
  onSend: () => void;
  onDiscard: () => void;
  onRecordAgain: () => void;
}

export function VoiceNoteReviewBar({
  blob,
  durationSeconds,
  isUploading,
  onSend,
  onDiscard,
  onRecordAgain,
}: VoiceNoteReviewBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const previewUrl = useMemo(() => URL.createObjectURL(blob), [blob]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.warn('[VoiceNoteReviewBar] playback failed:', err);
    }
  }, [isPlaying]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="voice-note-review w-full rounded-[22px] border border-primary/25 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/5 p-3 shadow-lg shadow-primary/10"
    >
      <audio
        ref={audioRef}
        src={previewUrl}
        preload="metadata"
        playsInline
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />

      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Voice note ready
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground ml-auto">
          {formatDuration(durationSeconds)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDiscard}
          className="h-10 w-10 rounded-full text-muted-foreground hover:text-destructive shrink-0"
          aria-label="Discard voice note"
        >
          <Trash2 className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRecordAgain}
          className="h-10 w-10 rounded-full shrink-0"
          aria-label="Record again"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={togglePlay}
          className={cn(
            'flex-1 min-w-0 h-10 rounded-full gap-2',
            isPlaying && 'border-primary/40 bg-primary/10',
          )}
        >
          {isPlaying ? (
            <>
              <Square className="h-3.5 w-3.5" />
              Pause
            </>
          ) : (
            <>
              <div className="w-0 h-0 border-l-[9px] border-l-current border-y-[5px] border-y-transparent ml-0.5" />
              Listen
            </>
          )}
        </Button>

        <Button
          type="button"
          size="icon"
          onClick={onSend}
          disabled={isUploading}
          className="h-11 w-11 rounded-full shrink-0 bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-md"
          aria-label="Send voice note"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2 text-center">
        Tap Listen to preview · trash to discard · arrow to re-record
      </p>
    </motion.div>
  );
}
