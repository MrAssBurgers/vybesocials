import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MailOpen } from 'lucide-react';
import { useAnnouncements, useDismissAnnouncement } from '@/hooks/useAnnouncements';
import { AnnouncementMediaPreview } from './AnnouncementMediaPreview';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export function AnnouncementModal() {
  const { data: announcements = [] } = useAnnouncements();
  const dismissMutation = useDismissAnnouncement();
  const [isOpen, setIsOpen] = useState(false);

  const latest = announcements[0];
  if (!latest) return null;

  const handleDismiss = () => {
    dismissMutation.mutate(latest.id);
    setIsOpen(false);
  };

  return (
    <AnimatePresence mode="wait">
      {!isOpen ? (
        /* ───── Closed pill ───── */
        <motion.div
          key="pill"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="flex justify-center my-4"
        >
          <div className="relative inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-card border border-border shadow-lg cursor-pointer group"
            onClick={() => setIsOpen(true)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-muted flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors z-10"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <motion.div
              animate={{ rotate: [0, -10, 10, -5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3 }}
            >
              <span className="text-2xl">📬</span>
            </motion.div>

            <div>
              <p className="font-bold text-sm text-foreground">New Announcement!</p>
              <p className="text-xs text-muted-foreground">Tap to open</p>
            </div>

            <motion.div
              className="ml-1 w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        </motion.div>
      ) : (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => setIsOpen(false)}
          />

          <motion.div
            key="letter"
            initial={{ scale: 0.5, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto"
          >
            <div className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              {/* Header — Title first */}
              <div className="relative px-6 pt-6 pb-4 shrink-0">
                <button
                  onClick={() => setIsOpen(false)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>

                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                    <MailOpen className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Announcement
                  </span>
                </div>

                <h2 className="text-xl font-bold text-foreground leading-tight">
                  {latest.title}
                </h2>
              </div>

              {/* Scrollable: Media → Content */}
              <div className="overflow-y-auto flex-1 min-h-0">
                {/* Media (centered between title and content) */}
                {latest.image_url && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="px-4"
                  >
                    <AnnouncementMediaPreview
                      url={latest.image_url}
                      mediaType={latest.media_type}
                      className="max-h-64"
                    />
                  </motion.div>
                )}

                {/* Content / Description */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="px-6 py-4"
                >
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                    {latest.content}
                  </p>
                </motion.div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-5 pt-2 flex items-center justify-between shrink-0 border-t border-border/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>By @{latest.author?.username}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(new Date(latest.created_at), { addSuffix: true })}</span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl text-xs"
                  onClick={handleDismiss}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
