import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import { ShortCard } from './ShortCard';
import { Button } from '@/components/ui/button';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';
import { PrivatePostTag } from '@/components/posts/PrivatePostTag';

interface ClipPost {
  id: string;
  media_url: string;
  thumbnail_url?: string | null;
  caption: string;
  tags: string[];
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  view_count?: number;
  owner_private?: boolean;
}

interface ClipsGridProps {
  clips: ClipPost[];
}

function ClipThumbnail({ clip, index, onClick }: { clip: ClipPost; index: number; onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count?.toString() || '0';
  };

  return (
    <motion.button
      type="button"
      aria-label={clip.caption.trim() ? `Play clip: ${clip.caption.trim()}` : `Play clip ${index + 1} by @${clip.author.username}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="aspect-[9/16] relative group cursor-pointer overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      onClick={onClick}
    >
      {/* Real poster frame — never a white play box */}
      <VideoThumbnail
        videoUrl={clip.media_url}
        thumbnailUrl={clip.thumbnail_url ?? null}
        alt={clip.caption || 'Clip'}
        className="w-full h-full object-cover"
      />

      {/* Subtle hover veil — no big play button */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* View count at bottom */}
      {clip.owner_private && <PrivatePostTag className="top-2 bottom-auto" />}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs font-medium drop-shadow-lg">
        <Eye className="h-3.5 w-3.5" />
        <span>{formatViewCount(clip.view_count || 0)}</span>
      </div>
    </motion.button>
  );
}

export function ClipsGrid({ clips }: ClipsGridProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const selectedIndex = clips.findIndex(clip => clip.id === selectedId);
  const selectedClip = clips[selectedIndex];

  const handleOpen = (id: string, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setSelectedId(id);
  };

  // A refetch can reorder or remove clips while the viewer is open. Never
  // silently switch to a different post, or reopen an item that disappeared.
  useEffect(() => {
    if (selectedId && !selectedClip) setSelectedId(null);
  }, [selectedId, selectedClip]);

  const handlePrev = () => {
    if (selectedIndex > 0) setSelectedId(clips[selectedIndex - 1].id);
  };

  const handleNext = () => {
    if (selectedClip && selectedIndex < clips.length - 1) setSelectedId(clips[selectedIndex + 1].id);
  };

  if (clips.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">🎬</p>
        <p className="text-muted-foreground">No clips yet</p>
      </div>
    );
  }

  return (
    <>
      {/* Grid of thumbnails */}
      <div className="grid grid-cols-3 gap-1">
        {clips.map((clip, index) => (
          <ClipThumbnail
            key={clip.id}
            clip={clip}
            index={index}
            onClick={event => handleOpen(clip.id, event.currentTarget)}
          />
        ))}
      </div>

      {/* Portal outside transformed profile scrollers; the dialog owns focus,
          Escape and scroll-lock cleanup, including route unmounts. */}
      <Dialog.Root open={!!selectedClip} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selectedClip && <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[159] bg-black" />
          <Dialog.Content
            aria-describedby={undefined}
            onCloseAutoFocus={event => {
              event.preventDefault();
              if (openerRef.current?.isConnected) openerRef.current.focus();
            }}
            className="fixed inset-0 z-[160] h-[100dvh] bg-black flex items-center justify-center outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
            onTouchStart={(e) => {
              touchStartY.current = e.touches.length === 1 ? e.touches[0].clientY : null;
            }}
            onTouchCancel={() => { touchStartY.current = null; }}
            onTouchEnd={(e) => {
              const startY = touchStartY.current;
              touchStartY.current = null;
              if (startY === null || !e.changedTouches[0]) return;
              const diff = startY - e.changedTouches[0].clientY;
              if (Math.abs(diff) > 50) {
                if (diff > 0) handleNext();
                else handlePrev();
              }
            }}
          >
            <Dialog.Title className="sr-only">Profile clips</Dialog.Title>
            <Dialog.Close asChild><Button
              aria-label="Close clips"
              variant="ghost"
              size="icon-round"
              className="absolute right-4 z-10 text-white bg-black/70 hover:bg-black/90"
              style={{ top: 'max(1rem, var(--sat, env(safe-area-inset-top, 0px)))' }}
            >
              <X className="h-6 w-6" strokeWidth={2.5} />
            </Button></Dialog.Close>

            {/* Clip content */}
            <div className="w-full h-full max-w-md mx-auto">
              <ShortCard key={selectedClip.id} post={selectedClip} isActive={true} />
            </div>

            {/* Clip counter - minimal, non-intrusive */}
            <div className="absolute left-4 z-10 flex items-center gap-1 rounded-full bg-black/70 p-1 text-white text-xs" style={{ bottom: 'max(1rem, var(--sab, env(safe-area-inset-bottom, 0px)))' }}>
              <Button variant="ghost" size="icon-round" aria-label="Previous clip" disabled={selectedIndex === 0} onClick={handlePrev}><ChevronUp /></Button>
              <span role="status" aria-live="polite" className="min-w-10 text-center">{selectedIndex + 1} / {clips.length}</span>
              <Button variant="ghost" size="icon-round" aria-label="Next clip" disabled={selectedIndex === clips.length - 1} onClick={handleNext}><ChevronDown /></Button>
            </div>

          </Dialog.Content>
        </Dialog.Portal>}
      </Dialog.Root>
    </>
  );
}
