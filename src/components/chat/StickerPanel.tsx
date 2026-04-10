import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, Sticker } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStickers, useDeleteSticker } from '@/hooks/useStickers';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface StickerPanelProps {
  open: boolean;
  onClose: () => void;
  onSendSticker: (imageUrl: string) => void;
}

export const StickerPanel = memo(function StickerPanel({ open, onClose, onSendSticker }: StickerPanelProps) {
  const { data: stickers, isLoading } = useStickers();
  const deleteSticker = useDeleteSticker();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSend = (imageUrl: string) => {
    haptics.tap();
    onSendSticker(imageUrl);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    deleteSticker.mutate(id, { onSettled: () => setDeletingId(null) });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-background border border-border rounded-2xl shadow-xl z-40 max-h-[280px] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
            <div className="flex items-center gap-1.5">
              <Sticker className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Stickers</span>
              {stickers && <span className="text-[10px] text-muted-foreground">({stickers.length})</span>}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Grid */}
          <div className="overflow-y-auto max-h-[220px] p-2">
            {isLoading ? (
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : !stickers || stickers.length === 0 ? (
              <div className="text-center py-8">
                <Sticker className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No stickers yet</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Long-press images in chat to save</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {stickers.map((sticker, i) => (
                  <motion.button
                    key={sticker.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => handleSend(sticker.image_url)}
                    className={cn(
                      "relative aspect-square rounded-xl overflow-hidden border border-border/20",
                      "hover:border-primary/40 active:scale-95 transition-all group",
                      deletingId === sticker.id && "opacity-50"
                    )}
                  >
                    <img
                      src={sticker.image_url}
                      alt="Sticker"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Delete button on hover */}
                    <button
                      onClick={(e) => handleDelete(e, sticker.id)}
                      className="absolute top-0.5 right-0.5 p-1 rounded-full bg-destructive/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
