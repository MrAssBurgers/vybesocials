import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { X, ChevronUp, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';

interface GalleryDrawerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (files: File[]) => void;
  multiple?: boolean;
}

export function GalleryDrawer({ open, onClose, onSelect, multiple = false }: GalleryDrawerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recentPhotos, setRecentPhotos] = useState<string[]>([]);
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 300], [1, 0]);

  // Trigger file picker immediately on open
  useEffect(() => {
    if (open) {
      // Small delay so the drawer animation starts first
      setTimeout(() => fileInputRef.current?.click(), 200);
    }
  }, [open]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.velocity.y > 300 || info.offset.y > 150) {
      triggerHaptic('light');
      onClose();
    }
  }, [onClose]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      triggerHaptic('medium');
      onSelect(files);
      onClose();
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onSelect, onClose]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 z-[210] bg-black/60"
            />
            {/* Drawer */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.3}
              onDragEnd={handleDragEnd}
              style={{ y, opacity }}
              className="fixed bottom-0 left-0 right-0 z-[211] rounded-t-3xl overflow-hidden"
              style2={{ backgroundColor: 'hsl(var(--card))' }}
            >
              <div className="bg-card border-t border-border rounded-t-3xl">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pb-4">
                  <h3 className="text-lg font-bold text-foreground">Gallery</h3>
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center active:scale-95 transition-transform"
                  >
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Gallery prompt */}
                <div className="px-5 pb-8">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-12 rounded-2xl border-2 border-dashed border-border bg-muted/30 flex flex-col items-center gap-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <ImageIcon className="w-7 h-7 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">Choose from Gallery</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {multiple ? 'Select up to 10 photos or videos' : 'Pick a photo or video'}
                      </p>
                    </div>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
