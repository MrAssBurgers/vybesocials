import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Send, 
  Scissors,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Loader2
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { formatDuration, useVideoProcessor, ProcessedVideo } from '@/hooks/useVideoProcessor';
import { cn } from '@/lib/utils';

interface VideoSendPreviewProps {
  open: boolean;
  onClose: () => void;
  file: File | null;
  recipientName?: string;
  recipientAvatar?: string;
  onSend: (processedVideo: ProcessedVideo, caption: string, trimStart?: number, trimEnd?: number) => void;
}

export function VideoSendPreview({
  open,
  onClose,
  file,
  recipientName,
  recipientAvatar,
  onSend,
}: VideoSendPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [caption, setCaption] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimRange, setTrimRange] = useState<[number, number]>([0, 100]);
  const [showTrimControls, setShowTrimControls] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const { process, isProcessing, progress } = useVideoProcessor();

  // Create object URL when file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setCaption('');
      setTrimRange([0, 100]);
      setShowTrimControls(false);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoUrl(null);
    }
  }, [file]);

  // Auto-play when opened
  useEffect(() => {
    if (open && videoRef.current && videoUrl) {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  }, [open, videoUrl]);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      
      // Loop within trim range
      const endTime = (trimRange[1] / 100) * duration;
      if (videoRef.current.currentTime >= endTime) {
        videoRef.current.currentTime = (trimRange[0] / 100) * duration;
      }
    }
  }, [trimRange, duration]);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const handleTrimChange = useCallback((values: number[]) => {
    setTrimRange([values[0], values[1]]);
    
    // Seek to start of trim range
    if (videoRef.current) {
      videoRef.current.currentTime = (values[0] / 100) * duration;
    }
  }, [duration]);

  const handleSend = useCallback(async () => {
    if (!file) return;
    
    setIsSending(true);
    try {
      const processed = await process(file);
      if (processed) {
        const trimStart = showTrimControls ? (trimRange[0] / 100) * duration : undefined;
        const trimEnd = showTrimControls ? (trimRange[1] / 100) * duration : undefined;
        onSend(processed, caption, trimStart, trimEnd);
        onClose();
      }
    } catch (error) {
      console.error('Failed to process video:', error);
    } finally {
      setIsSending(false);
    }
  }, [file, process, caption, trimRange, duration, showTrimControls, onSend, onClose]);

  if (!open || !videoUrl) return null;

  const trimStartTime = (trimRange[0] / 100) * duration;
  const trimEndTime = (trimRange[1] / 100) * duration;
  const trimmedDuration = trimEndTime - trimStartTime;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent absolute top-0 left-0 right-0 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={onClose}
            disabled={isSending}
          >
            <ArrowLeft className="h-6 w-6" />
          </Button>
          
          <div className="flex items-center gap-2">
            <span className="text-white/80 text-sm">Sending to</span>
            <Avatar className="h-6 w-6">
              <AvatarImage src={recipientAvatar} />
              <AvatarFallback className="text-xs">
                {recipientName?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <span className="text-white font-medium text-sm">{recipientName || 'Chat'}</span>
          </div>

          <div className="w-10" /> {/* Spacer for centering */}
        </div>

        {/* Video preview */}
        <div 
          className="flex-1 flex items-center justify-center relative"
          onClick={togglePlayPause}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            className="max-w-full max-h-full object-contain"
            playsInline
            loop
            muted={isMuted}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
          />

          {/* Play/Pause overlay */}
          <AnimatePresence>
            {!isPlaying && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div className="p-4 rounded-full bg-black/40 backdrop-blur-sm">
                  <Play className="h-10 w-10 text-white ml-1" fill="white" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Duration badge */}
          <div className="absolute top-20 right-4 px-2 py-1 rounded-lg bg-black/60 text-white text-sm font-medium">
            {formatDuration(showTrimControls ? trimmedDuration : duration)}
          </div>

          {/* Sound toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-20 left-4 text-white bg-black/40 hover:bg-black/60"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
          >
            {isMuted ? (
              <VolumeX className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Trim controls */}
        <AnimatePresence>
          {showTrimControls && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="px-4 pb-4"
            >
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/80 text-sm">Trim video</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white/60 hover:text-white text-xs"
                    onClick={() => setShowTrimControls(false)}
                  >
                    Reset
                  </Button>
                </div>
                
                <Slider
                  value={trimRange}
                  onValueChange={handleTrimChange}
                  min={0}
                  max={100}
                  step={1}
                  className="mb-2"
                />
                
                <div className="flex items-center justify-between text-xs text-white/60">
                  <span>{formatDuration(trimStartTime)}</span>
                  <span>{formatDuration(trimEndTime)}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom controls */}
        <div className="p-4 bg-gradient-to-t from-black/80 to-transparent">
          {/* Caption input */}
          <div className="flex items-center gap-3 mb-4">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption..."
              className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50"
              disabled={isSending}
            />
            
            {!showTrimControls && duration > 3 && (
              <Button
                variant="ghost"
                size="icon"
                className="text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => setShowTrimControls(true)}
                disabled={isSending}
              >
                <Scissors className="h-5 w-5" />
              </Button>
            )}
          </div>

          {/* Send button */}
          <Button
            className="w-full h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            onClick={handleSend}
            disabled={isSending || isProcessing}
          >
            {isSending || isProcessing ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{isProcessing ? `Processing ${progress}%` : 'Sending...'}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                <span>Send Video</span>
              </div>
            )}
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
