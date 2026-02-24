import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoTrimEditorProps {
  videoUrl: string;
  videoFile: File;
  onApply: (trimmedFile: File, startTime: number, endTime: number) => void;
  onCancel: () => void;
}

export function VideoTrimEditor({ videoUrl, videoFile, onApply, onCancel }: VideoTrimEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onMeta = () => { setDuration(v.duration); setEndTime(v.duration); };
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (v.currentTime >= endTime) { v.pause(); setIsPlaying(false); v.currentTime = startTime; }
    };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('timeupdate', onTime);
    return () => { v.removeEventListener('loadedmetadata', onMeta); v.removeEventListener('timeupdate', onTime); };
  }, [endTime, startTime]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) { v.pause(); setIsPlaying(false); }
    else { if (v.currentTime < startTime || v.currentTime >= endTime) v.currentTime = startTime; v.play(); setIsPlaying(true); }
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const handleTrackMouse = useCallback((e: React.MouseEvent, handle: 'start' | 'end') => {
    e.preventDefault();
    setDraggingHandle(handle);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingHandle || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * duration;

    if (draggingHandle === 'start') {
      const newStart = Math.min(time, endTime - 0.5);
      setStartTime(Math.max(0, newStart));
      if (videoRef.current) videoRef.current.currentTime = Math.max(0, newStart);
    } else {
      const newEnd = Math.max(time, startTime + 0.5);
      setEndTime(Math.min(duration, newEnd));
    }
  }, [draggingHandle, duration, startTime, endTime]);

  const handleMouseUp = useCallback(() => setDraggingHandle(null), []);

  const handleApply = () => {
    // Pass trimmed info back — actual trimming happens server-side or the parent stores the timestamps
    onApply(videoFile, startTime, endTime);
  };

  const trimDuration = endTime - startTime;
  const startPct = duration > 0 ? (startTime / duration) * 100 : 0;
  const endPct = duration > 0 ? (endTime / duration) * 100 : 100;
  const currentPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'hsl(var(--background) / 0.95)' }}
      onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0">
        <button onClick={onCancel} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" /> Cancel
        </button>
        <span className="text-sm font-bold text-foreground">Trim Video</span>
        <button onClick={handleApply} className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors">
          <Check className="w-4 h-4" /> Apply
        </button>
      </div>

      {/* Video preview */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-hidden">
        <div className="relative">
          <video ref={videoRef} src={videoUrl} className="max-w-full max-h-[50vh] object-contain rounded-xl" playsInline muted />
          <button onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-background/20 opacity-0 hover:opacity-100 transition-opacity rounded-xl">
            {isPlaying ? <Pause className="w-12 h-12 text-primary-foreground drop-shadow-lg" /> : <Play className="w-12 h-12 text-primary-foreground drop-shadow-lg" />}
          </button>
        </div>
      </div>

      {/* Trim info */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground pb-2">
        <span>Start: <span className="font-mono text-foreground">{formatTime(startTime)}</span></span>
        <span>End: <span className="font-mono text-foreground">{formatTime(endTime)}</span></span>
        <span>Duration: <span className="font-mono text-primary font-bold">{formatTime(trimDuration)}</span></span>
      </div>

      {/* Timeline scrubber */}
      <div className="border-t border-border/50 flex-shrink-0 px-6 py-6">
        <div ref={trackRef} className="relative h-12 rounded-xl bg-muted overflow-hidden cursor-pointer select-none">
          {/* Selected range */}
          <div className="absolute top-0 bottom-0 bg-primary/20 border-y-2 border-primary"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
          
          {/* Playhead */}
          <div className="absolute top-0 bottom-0 w-0.5 bg-foreground z-10"
            style={{ left: `${currentPct}%` }} />

          {/* Start handle */}
          <div className="absolute top-0 bottom-0 w-4 bg-primary rounded-l-lg cursor-ew-resize z-20 flex items-center justify-center"
            style={{ left: `calc(${startPct}% - 8px)` }}
            onMouseDown={(e) => handleTrackMouse(e, 'start')}>
            <div className="w-0.5 h-4 bg-primary-foreground rounded-full" />
          </div>

          {/* End handle */}
          <div className="absolute top-0 bottom-0 w-4 bg-primary rounded-r-lg cursor-ew-resize z-20 flex items-center justify-center"
            style={{ left: `calc(${endPct}% - 8px)` }}
            onMouseDown={(e) => handleTrackMouse(e, 'end')}>
            <div className="w-0.5 h-4 bg-primary-foreground rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
