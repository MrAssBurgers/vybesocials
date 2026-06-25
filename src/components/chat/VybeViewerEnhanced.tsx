import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Reply, Camera } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface VybeViewerProps {
  mediaUrl: string;
  mediaType?: 'photo' | 'video';
  messageId?: string;
  senderName?: string;
  senderAvatar?: string;
  isOpen: boolean;
  isViewed?: boolean;
  isOwn?: boolean;
  onClose: () => void;
  onReply?: () => void;
  onViewed?: () => void;
  onReact?: (emoji: string) => void;
}

const QUICK_REACTIONS = ['❤️', '🔥', '😍', '😂', '😮', '💯'];

export function VybeViewer({ 
  mediaUrl, 
  mediaType = 'photo',
  messageId,
  senderName,
  senderAvatar,
  isOpen, 
  isViewed = false,
  isOwn = false,
  onClose,
  onReply,
  onViewed,
  onReact,
}: VybeViewerProps) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showReplyHint, setShowReplyHint] = useState(false);
  const [hasMarkedViewed, setHasMarkedViewed] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [sentReaction, setSentReaction] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);
  const startTime = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const VYBE_DURATION = mediaType === 'video' ? 10000 : 5000;
  
  // If already viewed (server truth), close immediately
  useEffect(() => {
    if (isOpen && isViewed && !isOwn) {
      onClose();
      return;
    }
  }, [isOpen, isViewed, isOwn, onClose]);
  
  // Mark as viewed immediately on open
  useEffect(() => {
    if (isOpen && messageId && !isViewed && !hasMarkedViewed && !isOwn) {
      setHasMarkedViewed(true);
      onViewed?.();
    }
  }, [isOpen, messageId, isViewed, hasMarkedViewed, isOwn, onViewed]);

  // Progress timer
  useEffect(() => {
    if (!isOpen || isPaused) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          haptics.impact();
          onClose();
          return 0;
        }
        return prev + (100 / (VYBE_DURATION / 50));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, onClose, VYBE_DURATION]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      setIsPaused(false);
      setShowReplyHint(false);
      setShowReactions(false);
      setSentReaction(null);
      haptics.impact();
      
      // Play video if applicable
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }
    }
  }, [isOpen]);

  // Long press handlers
  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    startTime.current = Date.now();
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setIsPaused(true);
      setShowReplyHint(true);
      setShowReactions(true);
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
    } else if (!isLongPress.current && !showReactions) {
      haptics.impact();
      onClose();
    }
    
    setIsPaused(false);
    setShowReplyHint(false);
    setShowReactions(false);
    isLongPress.current = false;
  }, [onReply, onClose, showReactions]);

  // Send reaction
  const handleReaction = useCallback((emoji: string) => {
    haptics.success();
    setSentReaction(emoji);
    onReact?.(emoji);
    
    setTimeout(() => {
      onClose();
    }, 600);
  }, [onReact, onClose]);

  // Escape to close
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
          {/* Animated open glow */}
          <motion.div
            initial={{ opacity: 0.8, scale: 0.5 }}
            animate={{ opacity: 0, scale: 2 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.4) 0%, transparent 60%)',
            }}
          />
          
          {/* Progress bar */}
          <div className="absolute top-0 left-0 right-0 z-20 p-3 safe-area-inset-top">
            <div className="h-1 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <motion.div
                className="h-full rounded-full"
                style={{ 
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, hsl(var(--primary)), white, hsl(var(--accent)))',
                }}
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
                    <VybeWordmark size="xs" />
                  </div>
                </div>
                <p className="text-white/60 text-xs mt-0.5">
                  {isPaused ? 'Release to reply' : 'Hold to reply'}
                </p>
              </div>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                haptics.impact();
                onClose();
              }}
              className="p-2.5 rounded-full bg-black/40 hover:bg-black/60 transition-colors backdrop-blur-sm"
            >
              <X className="h-5 w-5 text-white" />
            </motion.button>
          </div>

          {/* Media content */}
          {mediaType === 'video' ? (
            <motion.video
              ref={videoRef}
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              src={mediaUrl}
              className="max-w-full max-h-full object-contain select-none"
              autoPlay
              playsInline
              loop={false}
            />
          ) : (
            <motion.img
              initial={{ scale: 1.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              src={mediaUrl}
              alt="VYBE"
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
            />
          )}

          {/* Quick reactions */}
          <AnimatePresence>
            {showReactions && (
              <motion.div
                initial={{ opacity: 0, y: 30, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute bottom-32 left-0 right-0 flex justify-center"
              >
                <div className="flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur-xl rounded-full border border-white/20">
                  {QUICK_REACTIONS.map((emoji, i) => (
                    <motion.button
                      key={emoji}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.05, type: 'spring', stiffness: 500 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReaction(emoji);
                      }}
                      className="text-3xl hover:scale-125 transition-transform"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sent reaction animation */}
          <AnimatePresence>
            {sentReaction && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 2, opacity: 1 }}
                exit={{ scale: 3, opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <span className="text-8xl">{sentReaction}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reply hint */}
          <AnimatePresence>
            {showReplyHint && !showReactions && (
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

          {/* Paused overlay */}
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

          {/* Gradient overlays */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
          
          {/* Vignette */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)'
          }} />
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(viewerContent, document.body);
}
