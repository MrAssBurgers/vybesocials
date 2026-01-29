import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  X, 
  Volume2, 
  VolumeX, 
  Download, 
  Share2, 
  Reply,
  Play,
  Pause 
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/hooks/useVideoProcessor';
import { cn } from '@/lib/utils';

interface VideoMessageViewerProps {
  open: boolean;
  onClose: () => void;
  src: string;
  senderName?: string;
  senderAvatar?: string;
  duration?: number;
  timestamp?: string;
  onReply?: () => void;
  onShare?: () => void;
}

export function VideoMessageViewer({
  open,
  onClose,
  src,
  senderName,
  senderAvatar,
  duration,
  timestamp,
  onReply,
  onShare,
}: VideoMessageViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  const [dragY, setDragY] = useState(0);

  // Auto-play when opened
  useEffect(() => {
    if (open && videoRef.current) {
      videoRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  }, [open]);

  // Hide controls after inactivity
  useEffect(() => {
    if (showControls && isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [showControls, isPlaying]);

  const handleInteraction = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(console.error);
    }
    setIsPlaying(!isPlaying);
    handleInteraction();
  }, [isPlaying, handleInteraction]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, [src]);

  // Handle swipe to dismiss
  const handleDrag = useCallback((_: any, info: PanInfo) => {
    setDragY(info.offset.y);
  }, []);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (Math.abs(info.offset.y) > 100 || Math.abs(info.velocity.y) > 500) {
      onClose();
    }
    setDragY(0);
  }, [onClose]);

  if (!open) return null;

  const videoDuration = duration || (videoRef.current?.duration || 0);
  const progress = videoDuration > 0 ? (currentTime / videoDuration) * 100 : 0;
  const opacity = Math.max(0.3, 1 - Math.abs(dragY) / 300);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black"
          style={{ opacity }}
          onClick={handleInteraction}
        >
          {/* Video container - draggable for swipe dismiss */}
          <motion.div
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.7}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            className="relative w-full h-full flex items-center justify-center"
            onClick={togglePlayPause}
          >
            <video
              ref={videoRef}
              src={src}
              className="max-w-full max-h-full object-contain"
              playsInline
              loop
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
            />
          </motion.div>

          {/* Controls overlay */}
          <AnimatePresence>
            {showControls && (
              <>
                {/* Top bar */}
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose();
                        }}
                      >
                        <X className="h-6 w-6" />
                      </Button>
                      
                      {senderName && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={senderAvatar} />
                            <AvatarFallback>{senderName[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-white text-sm font-medium">{senderName}</p>
                            {timestamp && (
                              <p className="text-white/60 text-xs">{timestamp}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
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
                </motion.div>

                {/* Center play/pause indicator */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <div className="p-4 rounded-full bg-black/40 backdrop-blur-sm">
                    {isPlaying ? (
                      <Pause className="h-8 w-8 text-white" fill="white" />
                    ) : (
                      <Play className="h-8 w-8 text-white ml-1" fill="white" />
                    )}
                  </div>
                </motion.div>

                {/* Bottom bar */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent"
                >
                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs text-white/80 mb-1">
                      <span>{formatDuration(currentTime)}</span>
                      <span>{formatDuration(videoDuration)}</span>
                    </div>
                    <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-center gap-6">
                    {onReply && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReply();
                          onClose();
                        }}
                      >
                        <Reply className="h-5 w-5" />
                      </Button>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload();
                      }}
                    >
                      <Download className="h-5 w-5" />
                    </Button>

                    {onShare && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShare();
                        }}
                      >
                        <Share2 className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Swipe indicator */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <div className="w-10 h-1 rounded-full bg-white/40" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
