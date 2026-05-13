import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { ChevronUp, MessageCircle } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { VybeSnapCamera } from '@/components/camera/VybeSnapCamera';
import { CameraMountBoundary } from '@/components/camera/CameraMountBoundary';
import { haptics } from '@/lib/haptics';
import { cn } from '@/lib/utils';

interface CameraFirstOverlayProps {
  isOpen: boolean;
  recipientName?: string;
  recipientAvatar?: string;
  onClose: () => void;
  onSend: (mediaUrl: string, isVideo: boolean) => void;
  onOpenChat: () => void;
}

export function CameraFirstOverlay({
  isOpen,
  recipientName,
  recipientAvatar,
  onClose,
  onSend,
  onOpenChat,
}: CameraFirstOverlayProps) {
  const [swipeY, setSwipeY] = useState(0);
  const swipeThreshold = -80;

  const handleDrag = useCallback((_: any, info: PanInfo) => {
    // Only track upward swipes
    if (info.offset.y < 0) {
      setSwipeY(info.offset.y);
    }
  }, []);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    setSwipeY(0);
    
    // Swipe up → open chat
    if (info.offset.y < swipeThreshold && Math.abs(info.velocity.y) > 100) {
      haptics.impact();
      onOpenChat();
      return;
    }
    
    // Swipe right → exit
    if (info.offset.x > 80 && Math.abs(info.velocity.x) > 100) {
      haptics.impact();
      onClose();
      return;
    }
  }, [swipeThreshold, onOpenChat, onClose]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[190]"
        style={{ willChange: 'transform' }}
      >
        {/* Camera layer */}
        <CameraMountBoundary onError={onClose}>
          <VybeSnapCamera
            isOpen={isOpen}
            onClose={onClose}
            onSend={onSend}
          />
        </CameraMountBoundary>

        {/* Gesture capture overlay - transparent, sits on top for swipe detection */}
        <motion.div
          className="absolute inset-0 z-[195] pointer-events-none"
          drag="y"
          dragConstraints={{ top: -200, bottom: 0 }}
          dragElastic={0.3}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{ pointerEvents: 'auto', touchAction: 'none' }}
        />

        {/* Recipient info bar at bottom */}
        {recipientName && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="absolute bottom-24 left-0 right-0 z-[196] flex justify-center pointer-events-none"
          >
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-full px-4 py-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={recipientAvatar} />
                <AvatarFallback className="text-[10px] font-bold bg-primary/60 text-primary-foreground">
                  {recipientName?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-white text-sm font-medium">{recipientName}</span>
            </div>
          </motion.div>
        )}

        {/* Swipe-up chat pill */}
        <motion.button
          onClick={() => { haptics.impact(); onOpenChat(); }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[196] flex flex-col items-center gap-1"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ChevronUp className="h-4 w-4 text-white/60" />
          <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md rounded-full px-4 py-2">
            <MessageCircle className="h-3.5 w-3.5 text-white/80" />
            <span className="text-white/80 text-xs font-semibold">Chat</span>
          </div>
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
