import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Megaphone, ChevronDown, ChevronUp } from 'lucide-react';
import { useAnnouncements, useDismissAnnouncement } from '@/hooks/useAnnouncements';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';

export function AnnouncementBanner() {
  const { data: announcements = [] } = useAnnouncements();
  const dismissMutation = useDismissAnnouncement();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const latestAnnouncement = announcements[0];

  if (!latestAnnouncement) return null;

  const isNew = new Date(latestAnnouncement.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        className="mx-4 mt-2 mb-3"
      >
        <div className="liquid-glass rounded-xl overflow-hidden border border-primary/20">
          <button
            onClick={() => setExpandedId(expandedId === latestAnnouncement.id ? null : latestAnnouncement.id)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/30 transition-colors"
          >
            <motion.div
              className="flex-shrink-0 w-8 h-8 rounded-full gradient-animated flex items-center justify-center"
              animate={isNew ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 1.5, repeat: isNew ? Infinity : 0 }}
            >
              <Megaphone className="h-4 w-4 text-white" />
            </motion.div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isNew && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full"
                  >
                    New Announcement!!
                  </motion.span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(latestAnnouncement.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="font-semibold text-sm truncate">{latestAnnouncement.title}</p>
            </div>

            <div className="flex items-center gap-2">
              {expandedId === latestAnnouncement.id ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>

          <AnimatePresence>
            {expandedId === latestAnnouncement.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 pt-0">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-sm whitespace-pre-wrap">{latestAnnouncement.content}</p>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-muted-foreground">
                      Posted by @{latestAnnouncement.author?.username}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissMutation.mutate(latestAnnouncement.id);
                      }}
                      className="h-7 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
