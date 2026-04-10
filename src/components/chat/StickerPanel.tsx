import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Trash2, Sticker, CheckSquare, Square, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStickers, useDeleteSticker } from '@/hooks/useStickers';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface StickerPanelProps {
  open: boolean;
  onClose: () => void;
  onSendSticker: (imageUrl: string) => void;
}

const SWIPE_DOWN_THRESHOLD = 60;

export const StickerPanel = memo(function StickerPanel({ open, onClose, onSendSticker }: StickerPanelProps) {
  const { data: stickers, isLoading } = useStickers();
  const deleteSticker = useDeleteSticker();
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const handleSend = (imageUrl: string) => {
    if (deleteMode) return; // Don't send in delete mode
    haptics.tap();
    onSendSticker(imageUrl);
    // Panel stays open — no onClose()
  };

  const toggleDeleteMode = useCallback(() => {
    setDeleteMode(prev => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (!stickers) return;
    if (selectedIds.size === stickers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(stickers.map(s => s.id)));
    }
  }, [stickers, selectedIds.size]);

  const deleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      deleteSticker.mutate(id);
    }
    setSelectedIds(new Set());
    setDeleteMode(false);
    setDeleting(false);
  }, [selectedIds, deleteSticker]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.offset.y > SWIPE_DOWN_THRESHOLD) {
      onClose();
      setDeleteMode(false);
      setSelectedIds(new Set());
    }
  }, [onClose]);

  const handleClose = useCallback(() => {
    onClose();
    setDeleteMode(false);
    setSelectedIds(new Set());
  }, [onClose]);

  const allSelected = stickers ? selectedIds.size === stickers.length && stickers.length > 0 : false;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={handleDragEnd}
          className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-background border border-border rounded-2xl shadow-xl z-40 max-h-[280px] overflow-hidden"
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-0.5 cursor-grab">
            <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
            <div className="flex items-center gap-1.5">
              <Sticker className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Stickers</span>
              {stickers && <span className="text-[10px] text-muted-foreground">({stickers.length})</span>}
            </div>
            <div className="flex items-center gap-1">
              {/* Trash toggle */}
              {stickers && stickers.length > 0 && (
                <Button
                  variant={deleteMode ? "destructive" : "ghost"}
                  size="icon"
                  className="h-6 w-6"
                  onClick={toggleDeleteMode}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Delete mode toolbar */}
          <AnimatePresence>
            {deleteMode && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-border/30"
              >
                <div className="flex items-center justify-between px-3 py-1.5">
                  <button
                    onClick={selectAll}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {allSelected ? (
                      <CheckSquare className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <Square className="h-3.5 w-3.5" />
                    )}
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 text-xs px-2"
                    disabled={selectedIds.size === 0 || deleting}
                    onClick={deleteSelected}
                  >
                    Delete ({selectedIds.size})
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Grid */}
          <div className="overflow-y-auto max-h-[200px] p-2">
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
                    onClick={() => deleteMode ? toggleSelect(sticker.id) : handleSend(sticker.image_url)}
                    className={cn(
                      "relative aspect-square rounded-xl overflow-hidden border-2 transition-all",
                      deleteMode && selectedIds.has(sticker.id)
                        ? "border-destructive"
                        : "border-border/20 hover:border-primary/40",
                      "active:scale-95"
                    )}
                  >
                    <img
                      src={sticker.image_url}
                      alt="Sticker"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {/* Selection indicator in delete mode */}
                    {deleteMode && (
                      <div className="absolute top-0.5 right-0.5">
                        {selectedIds.has(sticker.id) ? (
                          <CheckCircle2 className="h-4 w-4 text-destructive drop-shadow" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-white/70 bg-black/20" />
                        )}
                      </div>
                    )}
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
