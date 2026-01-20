import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Reply, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VybeViewerProps {
  mediaUrl: string;
  senderName?: string;
  senderAvatar?: string;
  isOpen: boolean;
  onClose: () => void;
  onReply?: () => void;
}

export function VybeViewer({ 
  mediaUrl, 
  senderName,
  senderAvatar,
  isOpen, 
  onClose,
  onReply 
}: VybeViewerProps) {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const VYBE_DURATION = 5000; // 5 seconds like Snapchat

  // Progress timer - auto close after duration
  useEffect(() => {
    if (!isOpen || isPaused) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          onClose();
          return 0;
        }
        return prev + (100 / (VYBE_DURATION / 50));
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isOpen, isPaused, onClose]);

  // Reset progress when opening
  useEffect(() => {
    if (isOpen) {
      setProgress(0);
      setIsPaused(false);
    }
  }, [isOpen]);

  // Long press to pause (for reply)
  const handleTouchStart = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setIsPaused(true);
    }, 300);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (isLongPress.current && onReply) {
      // User held to reply
      onReply();
      onClose();
    } else {
      setIsPaused(false);
    }
    isLongPress.current = false;
  }, [onReply, onClose]);

  // Tap to close
  const handleTap = useCallback(() => {
    if (!isLongPress.current) {
      onClose();
    }
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseUp={handleTouchEnd}
          onClick={handleTap}
        >
          {/* Progress bar at top */}
          <div className="absolute top-0 left-0 right-0 z-20 p-3 safe-area-inset-top">
            <div className="h-0.5 bg-white/30 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white"
                style={{ width: `${progress}%` }}
                transition={{ duration: 0.05 }}
              />
            </div>
          </div>

          {/* Header */}
          <div className="absolute top-6 left-0 right-0 z-20 flex items-center justify-between px-4 safe-area-inset-top">
            <div className="flex items-center gap-3">
              {senderAvatar ? (
                <img 
                  src={senderAvatar} 
                  alt={senderName || 'User'} 
                  className="w-9 h-9 rounded-full border-2 border-white/50 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center border-2 border-white/50">
                  <Camera className="h-4 w-4 text-white" />
                </div>
              )}
              <div>
                <p className="text-white font-semibold text-sm">{senderName || 'VYBE'}</p>
                <p className="text-white/60 text-xs">Hold to reply</p>
              </div>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>

          {/* VYBE Image - fullscreen */}
          <motion.img
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            src={mediaUrl}
            alt="VYBE"
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />

          {/* Hold to reply hint */}
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-20 left-0 right-0 flex justify-center"
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-md rounded-full">
                <Reply className="h-4 w-4 text-white" />
                <span className="text-white text-sm font-medium">Release to reply</span>
              </div>
            </motion.div>
          )}

          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
