import { useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Trash2, MoreVertical, SmilePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { getTopEmojis } from '@/lib/frequentEmojis';

interface ImageViewerProps {
  mediaUrl: string;
  mediaType: 'image' | 'gif' | 'video';
  onClose: () => void;
  onReply?: () => void;
  onReaction?: (emoji: string) => void;
  onDelete?: () => void;
  senderName?: string;
  timestamp?: string;
  isOwn?: boolean;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢'];

export function ImageViewer({
  mediaUrl,
  mediaType,
  onClose,
  onReply,
  onReaction,
  onDelete,
  senderName,
  timestamp,
  isOwn,
}: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const isLocalUrl = mediaUrl?.startsWith('blob:') || mediaUrl?.startsWith('data:');
  const resolvedUrl = useSignedUrl(isLocalUrl ? null : mediaUrl);
  const displayUrl = isLocalUrl ? mediaUrl : resolvedUrl;

  const formattedTime = useMemo(() => {
    if (!timestamp) return '';
    try {
      return format(new Date(timestamp), 'EEE HH:mm');
    } catch {
      return '';
    }
  }, [timestamp]);

  const displayName = senderName || (isOwn ? 'You' : 'Photo');

  const handleSave = useCallback(async () => {
    if (!displayUrl) return;
    try {
      const response = await fetch(displayUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vybe-${Date.now()}.${mediaType === 'video' ? 'mp4' : 'jpg'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Saved to device');
    } catch {
      toast.error('Failed to save');
    }
  }, [displayUrl, mediaType]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
      lastTouchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    } else if (e.touches.length === 1 && scale > 1) {
      isDragging.current = true;
      lastTouchCenter.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [scale]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newScale = Math.max(1, Math.min(5, scale * (dist / lastTouchDistance.current)));
      setScale(newScale);
      lastTouchDistance.current = dist;
      if (newScale <= 1) setPosition({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && isDragging.current && lastTouchCenter.current && scale > 1) {
      const dx = e.touches[0].clientX - lastTouchCenter.current.x;
      const dy = e.touches[0].clientY - lastTouchCenter.current.y;
      setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastTouchCenter.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [scale]);

  const handleTouchEnd = useCallback(() => {
    lastTouchDistance.current = null;
    isDragging.current = false;
    if (scale <= 1) {
      setPosition({ x: 0, y: 0 });
      setScale(1);
    }
  }, [scale]);

  const toggleZoom = useCallback(() => {
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  }, [scale]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[995] bg-[#1a1a1a] flex flex-col"
    >
      {/* Top bar — Google Messages style */}
      <div className="flex items-center justify-between px-2 py-3 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/90 hover:bg-white/10 h-10 w-10"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="flex flex-col">
            <span className="text-white/90 text-sm font-medium leading-tight">
              {displayName}
            </span>
            {formattedTime && (
              <span className="text-white/50 text-xs leading-tight">
                {formattedTime}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSave}
            className="text-white/80 hover:bg-white/10 h-10 w-10"
          >
            <Download className="h-5 w-5" />
          </Button>
          {isOwn && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { onDelete(); onClose(); }}
              className="text-white/80 hover:bg-white/10 h-10 w-10"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Media — centered with padding */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden px-3"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={toggleZoom}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {displayUrl && mediaType !== 'video' ? (
          <motion.img
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            src={displayUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain select-none rounded-2xl"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transition: isDragging.current ? 'none' : 'transform 0.2s ease',
            }}
            draggable={false}
          />
        ) : displayUrl && mediaType === 'video' ? (
          <motion.video
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            src={displayUrl}
            className="max-w-full max-h-full object-contain rounded-2xl"
            controls
            autoPlay
            playsInline
          />
        ) : null}
      </div>

      {/* Bottom bar — Google Messages style emoji reactions */}
      <div className="z-10 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center justify-center gap-3">
          {onReply && (
            <button
              onClick={() => { onReply(); onClose(); }}
              className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            >
              <span className="text-white/80 text-xs font-medium">💬</span>
            </button>
          )}
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onReaction?.(emoji);
                onClose();
              }}
              className="h-11 w-11 flex items-center justify-center text-2xl active:scale-75 transition-transform rounded-full hover:bg-white/5"
            >
              {emoji}
            </button>
          ))}
          <button
            className="h-11 w-11 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-transform"
            onClick={() => {
              // Could open full emoji picker in the future
            }}
          >
            <SmilePlus className="h-5 w-5 text-white/60" />
          </button>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
