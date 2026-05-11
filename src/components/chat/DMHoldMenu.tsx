/**
 * DMHoldMenu — Shared Instagram-style dark context menu
 * Used by both DM bubbles and notification toasts on long-press.
 */

import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Reply, Copy, Download, Sparkles, Edit3, Trash2, EyeOff, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getTopEmojis } from '@/lib/frequentEmojis';

export interface DMHoldMenuProps {
  open: boolean;
  onClose: () => void;
  messageContent?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  isOwn: boolean;
  userReaction?: string | null;
  onReaction: (emoji: string) => void;
  onReply: () => void;
  onEdit?: () => void;
  onUnsend?: () => void;
  onDeleteForMe?: () => void;
  onSave?: () => void;
  onSaveSticker?: () => void;
  onToggleKeep?: () => void;
  isKept?: boolean;
}

const INITIAL_BACKDROP_GUARD_MS = 260;

export const DMHoldMenu = memo(function DMHoldMenu({
  open,
  onClose,
  messageContent,
  mediaUrl,
  mediaType,
  isOwn,
  userReaction,
  onReaction,
  onReply,
  onEdit,
  onUnsend,
  onDeleteForMe,
  onSave,
  onSaveSticker,
  onToggleKeep,
  isKept,
}: DMHoldMenuProps) {
  const smartEmojis = useMemo(() => getTopEmojis(6), []);
  const ignoreBackdropRef = useRef(false);

  useEffect(() => {
    if (!open) {
      ignoreBackdropRef.current = false;
      return;
    }

    ignoreBackdropRef.current = true;
    const timeout = window.setTimeout(() => {
      ignoreBackdropRef.current = false;
    }, INITIAL_BACKDROP_GUARD_MS);

    return () => window.clearTimeout(timeout);
  }, [open]);

  const isMediaMessage = mediaUrl && (mediaType === 'image' || mediaType === 'gif');
  const isVideoMessage = mediaUrl && mediaType === 'video';

  const handleReaction = useCallback((emoji: string) => {
    onReaction(emoji);
    onClose();
  }, [onReaction, onClose]);

  const copyToClipboard = useCallback(() => {
    if (messageContent) {
      navigator.clipboard.writeText(messageContent);
      toast.success('Copied to clipboard');
    }
    onClose();
  }, [messageContent, onClose]);

  const handleAction = useCallback((action?: () => void) => {
    action?.();
    onClose();
  }, [onClose]);

  const handleBackdropClick = useCallback(() => {
    if (ignoreBackdropRef.current) return;
    onClose();
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[990]"
            onClick={handleBackdropClick}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="fixed z-[991] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] rounded-2xl bg-white/[0.08] backdrop-blur-xl border border-white/[0.12] shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-around px-4 py-3 border-b border-white/[0.08]">
              {smartEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => { e.stopPropagation(); handleReaction(emoji); }}
                  className={cn(
                    'text-2xl p-1 hover:scale-125 active:scale-90 transition-transform rounded-full',
                    userReaction === emoji && 'bg-white/10'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <MenuRow icon={Reply} label="Reply" onClick={() => handleAction(onReply)} />

            {messageContent && (
              <>
                <MenuDivider />
                <MenuRow icon={Copy} label="Copy" onClick={copyToClipboard} />
              </>
            )}

            {(isMediaMessage || isVideoMessage) && onSave && (
              <>
                <MenuDivider />
                <MenuRow icon={Download} label="Save" onClick={() => handleAction(onSave)} />
              </>
            )}

            {isMediaMessage && onSaveSticker && (
              <>
                <MenuDivider />
                <MenuRow icon={Sparkles} label="Save Sticker" onClick={() => handleAction(onSaveSticker)} />
              </>
            )}

            {isOwn && messageContent && !mediaUrl && onEdit && (
              <>
                <MenuDivider />
                <MenuRow icon={Edit3} label="Edit" onClick={() => handleAction(onEdit)} />
              </>
            )}

            <MenuDivider />
            {isOwn && onUnsend && (
              <MenuRow icon={Trash2} label="Unsend" onClick={() => handleAction(onUnsend)} destructive />
            )}
            {onDeleteForMe && (
              <MenuRow icon={EyeOff} label="Delete for me" onClick={() => handleAction(onDeleteForMe)} muted />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
});

function MenuRow({ icon: Icon, label, onClick, destructive, muted }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-4 py-3 text-left text-[14px] font-normal active:bg-white/10 flex items-center gap-3 transition-colors',
        destructive ? 'text-red-400' : muted ? 'text-white/40' : 'text-white/90'
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="border-t border-white/[0.08]" />;
}
