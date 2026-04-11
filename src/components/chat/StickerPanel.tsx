import { memo, useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { X, Trash2, Sticker, CheckSquare, Square, CheckCircle2, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStickers, useDeleteSticker } from '@/hooks/useStickers';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';

interface StickerPanelProps {
  open: boolean;
  onClose: () => void;
  onSendSticker: (imageUrl: string) => void;
}

const SWIPE_DOWN_THRESHOLD = 60;

/* ── Individual sticker tile with signed URL ── */
const StickerTile = memo(function StickerTile({
  sticker,
  index,
  deleteMode,
  selected,
  onTap,
}: {
  sticker: { id: string; image_url: string };
  index: number;
  deleteMode: boolean;
  selected: boolean;
  onTap: () => void;
}) {
  const signedUrl = useSignedUrl(sticker.image_url);
  const [errored, setErrored] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.02 }}
      onClick={onTap}
      className={cn(
        "relative aspect-square rounded-2xl overflow-hidden transition-all",
        "bg-muted/40",
        deleteMode && selected
          ? "ring-2 ring-destructive"
          : "hover:bg-muted/60 active:scale-95"
      )}
    >
      {signedUrl && !errored ? (
        <img
          src={signedUrl}
          alt="Sticker"
          className="w-full h-full object-contain p-1.5 pointer-events-none"
          loading="lazy"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
        />
      ) : errored ? (
        <div className="w-full h-full flex items-center justify-center">
          <ImageOff className="h-6 w-6 text-muted-foreground/40" />
        </div>
      ) : (
        <div className="w-full h-full rounded-2xl bg-muted/40 animate-pulse" />
      )}

      {deleteMode && (
        <div className="absolute top-1 right-1 pointer-events-none">
          {selected ? (
            <CheckCircle2 className="h-5 w-5 text-destructive drop-shadow" />
          ) : (
            <div className="h-5 w-5 rounded-full border-2 border-white/70 bg-black/20" />
          )}
        </div>
      )}
    </motion.button>
  );
});

/* ── Main panel ── */
export const StickerPanel = memo(function StickerPanel({ open, onClose, onSendSticker }: StickerPanelProps) {
  const { data: stickers, isLoading } = useStickers();
  const deleteSticker = useDeleteSticker();
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const handleSend = (imageUrl: string) => {
    if (deleteMode) return;
    haptics.tap();
    onSendSticker(imageUrl);
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
          className="absolute bottom-full left-0 right-0 mb-1 mx-2 bg-background border border-border rounded-2xl shadow-xl z-40 max-h-[340px] overflow-hidden"
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
          <div className="overflow-y-auto max-h-[260px] p-3">
            {isLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-2xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : !stickers || stickers.length === 0 ? (
              <div className="text-center py-8">
                <Sticker className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No stickers yet</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">Long-press images in chat to save</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {stickers.map((sticker, i) => (
                  <StickerTile
                    key={sticker.id}
                    sticker={sticker}
                    index={i}
                    deleteMode={deleteMode}
                    selected={selectedIds.has(sticker.id)}
                    onTap={() => deleteMode ? toggleSelect(sticker.id) : handleSend(sticker.image_url)}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
