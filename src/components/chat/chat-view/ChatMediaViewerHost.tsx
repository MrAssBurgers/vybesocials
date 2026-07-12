import { AnimatePresence } from 'framer-motion';
import { ImageViewer } from '@/components/chat/ImageViewer';

export interface ChatMediaViewerHostProps {
  viewerMedia: {
    url: string;
    type: 'image' | 'video' | 'gif';
    senderName?: string;
    timestamp?: string;
  } | null;
  isOwn?: boolean;
  onClose: () => void;
  onReply?: () => void;
  onReaction?: (emoji: string) => void;
  onDelete?: () => void;
}

/** Routes fullscreen image/video viewers from ChatView. */
export function ChatMediaViewerHost({
  viewerMedia,
  isOwn,
  onClose,
  onReply,
  onReaction,
  onDelete,
}: ChatMediaViewerHostProps) {
  return (
    <AnimatePresence>
      {viewerMedia && (
        <ImageViewer
          mediaUrl={viewerMedia.url}
          mediaType={viewerMedia.type === 'gif' ? 'image' : viewerMedia.type}
          onClose={onClose}
          onReply={onReply}
          onReaction={onReaction}
          onDelete={onDelete}
          senderName={viewerMedia.senderName}
          timestamp={viewerMedia.timestamp}
          isOwn={isOwn}
        />
      )}
    </AnimatePresence>
  );
}
