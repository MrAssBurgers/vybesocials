import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Reply, Camera, Eye, Download, Loader2 } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { haptics } from '@/lib/haptics';
import { useCaptureDetection } from '@/hooks/useCaptureDetection';
import { CaptureShield } from '@/components/chat/CaptureShield';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { needsSigning, isFailedUrl } from '@/lib/signedUrlCache';
import { toast } from 'sonner';

interface VybeViewerProps {
  mediaUrl: string;
  messageId?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  isOpen: boolean;
  isViewed?: boolean;
  isOwn?: boolean;
  onClose: () => void;
  onReply?: () => void;
  onViewed?: () => void;
  onSave?: () => void;
}

const IMAGE_DURATION = 5000;

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') || lower.includes('.avi') || lower.includes('video');
}

/**
 * Check if a URL is a private storage URL that needs signing before it can be displayed.
 */
function isStorageUrl(url: string): boolean {
  if (!url) return false;
  return needsSigning(url);
}

export function VybeViewer({ 
  mediaUrl, 
  messageId,
  senderId,
  senderName,
  senderAvatar,
  isOpen, 
  isViewed = false,
  isOwn = false,
  onClose,
  onReply,
  onViewed,
  onSave,
}: VybeViewerProps) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showReplyHint, setShowReplyHint] = useState(false);
  const [hasMarkedViewed, setHasMarkedViewed] = useState(false);
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const startTime = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mediaDuration, setMediaDuration] = useState<number>(IMAGE_DURATION);
  const isVideo = isVideoUrl(mediaUrl);
  const hasMedia = !!mediaUrl && mediaUrl.length > 5;
  
  // Only sign storage URLs; for data:/blob: URLs use directly
  const requiresSigning = hasMedia && isStorageUrl(mediaUrl);
  const signedUrl = useSignedUrl(requiresSigning ? mediaUrl : null);
  
  // Determine the display URL:
  // - For storage URLs: wait for signedUrl, don't use raw mediaUrl
  // - For data/blob/external URLs: use directly
  const displayUrl = requiresSigning
    ? signedUrl  // null until signed, then the signed URL
    : (hasMedia ? mediaUrl : null);
  
  // Are we still waiting for the signed URL?
  const isSigningPending = requiresSigning && !signedUrl;

  // Capture detection
  const { captured } = useCaptureDetection({
    enabled: isOpen && !isOwn,
    senderId,
    mediaId: messageId,
    onCaptureDetected: (type) => {
      toast.error('Capture detected', { duration: 2000 });
    },
  });
  
  const openedByUserRef = useRef(false);
  useEffect(() => {
    if (isOpen) {
      openedByUserRef.current = true;
    } else {
      openedByUserRef.current = false;
    }
  }, [isOpen]);
  
  // Reset all state when viewer opens or media changes
  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      setIsPaused(false);
      setShowReplyHint(false);
      setMediaDuration(IMAGE_DURATION);
      setMediaLoaded(false);
      setImgError(false);
      setHasMarkedViewed(false);
      setRetryCount(0);
      haptics.impact();
    }
  }, [isOpen, mediaUrl]);

  // Mark vybe as viewed only AFTER media has loaded successfully
  useEffect(() => {
    if (isOpen && messageId && !isViewed && !hasMarkedViewed && !isOwn && mediaLoaded) {
      console.log('[VybeViewer] Marking as viewed after successful load');
      setHasMarkedViewed(true);
      onViewed?.();
    }
  }, [isOpen, messageId, isViewed, hasMarkedViewed, isOwn, onViewed, mediaLoaded]);

  // Handle successful media load
  const handleMediaLoaded = useCallback(() => {
    setMediaLoaded(true);
    setImgError(false);
  }, []);

  // Handle video metadata loaded
  const handleVideoLoaded = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.duration && isFinite(video.duration)) {
      setMediaDuration(video.duration * 1000);
    }
    handleMediaLoaded();
  }, [handleMediaLoaded]);

  const handleVideoEnded = useCallback(() => {
    haptics.impact();
    onClose();
  }, [onClose]);

  // Pause/resume video
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    if (isPaused) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  }, [isPaused, isVideo]);

  // Progress timer — only start AFTER media has loaded
  useEffect(() => {
    if (!isOpen || isPaused || !mediaLoaded) return;

    if (isVideo) {
      const video = videoRef.current;
      if (!video) return;
      const updateProgress = () => {
        if (video.duration && isFinite(video.duration)) {
          setProgress((video.currentTime / video.duration) * 100);
        }
      };
      video.addEventListener('timeupdate', updateProgress);
      return () => video.removeEventListener('timeupdate', updateProgress);
    }

    // For images
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          haptics.impact();
          onClose();
          return 0;
        }
        return prev + (100 / (mediaDuration / 50));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, onClose, isVideo, mediaDuration, mediaLoaded]);

  // Long press to pause (for reply)
  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    startTime.current = Date.now();
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setIsPaused(true);
      setShowReplyHint(true);
      haptics.impact();
    }, 300);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    const holdDuration = Date.now() - startTime.current;
    
    if (isLongPress.current && holdDuration > 500 && onReply) {
      haptics.success();
      onReply();
      onClose();
    } else if (!isLongPress.current) {
      haptics.impact();
      onClose();
    }
    
    setIsPaused(false);
    setShowReplyHint(false);
    isLongPress.current = false;
  }, [onReply, onClose]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        haptics.impact();
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Render media content based on state
  const renderMediaContent = () => {
    // No media URL at all
    if (!hasMedia) {
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
            <Camera className="h-10 w-10 text-white/50" />
          </div>
          <p className="text-white/60 text-sm">Media no longer available</p>
        </div>
      );
    }

    // Still waiting for signed URL
    if (isSigningPending) {
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          >
            <Loader2 className="h-10 w-10 text-white/70" />
          </motion.div>
          <p className="text-white/60 text-sm">Loading...</p>
        </div>
      );
    }

    // Signed URL resolved but image failed to load — retry once after 2s
    if (imgError) {
      if (retryCount < 2) {
        // Auto-retry
        setTimeout(() => {
          setImgError(false);
          setRetryCount(prev => prev + 1);
        }, 2000);
        return (
          <div className="flex flex-col items-center justify-center gap-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 className="h-10 w-10 text-white/70" />
            </motion.div>
            <p className="text-white/60 text-sm">Retrying...</p>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
            <Camera className="h-10 w-10 text-white/50" />
          </div>
          <p className="text-white/60 text-sm">Media no longer available</p>
        </div>
      );
    }

    // We have a displayUrl, render the media
    if (displayUrl) {
      if (isVideo) {
        return (
          <motion.video
            ref={videoRef}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            src={displayUrl}
            className="max-w-full max-h-full object-contain select-none"
            autoPlay
            playsInline
            onLoadedMetadata={handleVideoLoaded}
            onEnded={handleVideoEnded}
            onError={() => setImgError(true)}
            draggable={false}
          />
        );
      }
      return (
        <motion.img
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          src={displayUrl}
          alt="VYBE"
          className="max-w-full max-h-full object-contain select-none"
          draggable={false}
          onLoad={handleMediaLoaded}
          onError={() => setImgError(true)}
        />
      );
    }

    return null;
  };

  const viewerContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
        >
          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 z-20 p-3 safe-area-inset-top">
            <div className="h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <motion.div
                className="h-full bg-gradient-to-r from-primary via-white to-accent rounded-full"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>
          </div>

          {/* Header */}
          <div className="absolute top-8 left-0 right-0 z-20 flex items-center justify-between px-4 safe-area-inset-top">
            <div className="flex items-center gap-3">
              {senderAvatar ? (
                <motion.img 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 500 }}
                  src={senderAvatar} 
                  alt={senderName || 'User'} 
                  className="w-10 h-10 rounded-full border-2 border-white/50 object-cover shadow-lg"
                />
              ) : (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 500 }}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center border-2 border-white/50 shadow-lg"
                >
                  <Camera className="h-5 w-5 text-white" />
                </motion.div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold text-sm">{senderName || 'VYBE'}</p>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-primary/50 to-accent/50 backdrop-blur-sm">
                    <VybeMiniIcon size={12} showSparkles />
                    <span className="text-[10px] text-white font-semibold">VYBE</span>
                  </div>
                </div>
                <p className="text-white/60 text-xs mt-0.5">Hold to reply</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {onSave && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    haptics.success();
                    onSave();
                    onClose();
                  }}
                  className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors backdrop-blur-sm flex items-center justify-center"
                >
                  <Download className="h-5 w-5 text-white" strokeWidth={2.5} />
                </motion.button>
              )}
              
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.impact();
                  onClose();
                }}
                className="p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors backdrop-blur-sm flex items-center justify-center"
              >
                <X className="h-6 w-6 text-white" strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>

          {/* Media content */}
          <CaptureShield captured={captured} showBadge={!isOwn} />
          {renderMediaContent()}

          {/* Hold to reply indicator */}
          <AnimatePresence>
            {showReplyHint && (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                className="absolute bottom-24 left-0 right-0 flex justify-center"
              >
                <div className="flex items-center gap-3 px-6 py-3 bg-white/20 backdrop-blur-xl rounded-full border border-white/30 shadow-2xl">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Reply className="h-5 w-5 text-white" />
                  </motion.div>
                  <span className="text-white text-sm font-semibold">Release to reply</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Paused indicator */}
          <AnimatePresence>
            {isPaused && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/20 pointer-events-none"
              />
            )}
          </AnimatePresence>

          {/* Gradients and vignette */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)'
          }} />
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(viewerContent, document.body);
}
