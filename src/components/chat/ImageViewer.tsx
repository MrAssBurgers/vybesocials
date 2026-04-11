import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Reply, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { toast } from 'sonner';

interface ImageViewerProps {
  mediaUrl: string;
  mediaType: 'image' | 'gif' | 'video';
  onClose: () => void;
  onReply?: () => void;
}

export function ImageViewer({ mediaUrl, mediaType, onClose, onReply }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const isLocalUrl = mediaUrl?.startsWith('blob:') || mediaUrl?.startsWith('data:');
  const resolvedUrl = useSignedUrl(isLocalUrl ? null : mediaUrl);
  const displayUrl = isLocalUrl ? mediaUrl : resolvedUrl;

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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] bg-black flex flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/10 h-10 w-10"
        >
          <X className="h-6 w-6" />
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleZoom}
            className="text-white hover:bg-white/10 h-10 w-10"
          >
            {scale > 1 ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Media */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={toggleZoom}
      >
        {displayUrl && mediaType !== 'video' ? (
          <img
            src={displayUrl}
            alt="Full size"
            className="max-w-full max-h-full object-contain select-none"
            style={{
              transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
              transition: isDragging.current ? 'none' : 'transform 0.2s ease',
            }}
            draggable={false}
          />
        ) : displayUrl && mediaType === 'video' ? (
          <video
            src={displayUrl}
            className="max-w-full max-h-full object-contain"
            controls
            autoPlay
            playsInline
          />
        ) : null}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-center gap-6 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] z-10">
        {onReply && (
          <Button
            variant="ghost"
            onClick={() => { onReply(); onClose(); }}
            className="text-white hover:bg-white/10 gap-2"
          >
            <Reply className="h-5 w-5" />
            Reply
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={handleSave}
          className="text-white hover:bg-white/10 gap-2"
        >
          <Download className="h-5 w-5" />
          Save
        </Button>
      </div>
    </motion.div>
  );
}
