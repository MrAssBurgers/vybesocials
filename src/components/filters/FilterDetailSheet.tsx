import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bookmark, BookmarkCheck, Share2, Sparkles, Eye, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Filter, useSaveFilter, useSavedFilters, useFilterPosts } from '@/hooks/useFilters';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface FilterDetailSheetProps {
  filter: Filter | null;
  onClose: () => void;
}

export function FilterDetailSheet({ filter, onClose }: FilterDetailSheetProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { save, unsave } = useSaveFilter();
  const { data: savedFilters = [] } = useSavedFilters();
  const { data: posts = [] } = useFilterPosts(filter?.id || null);

  const isSaved = filter ? savedFilters.some(f => f.id === filter.id) : false;

  const handleSave = async () => {
    if (!user || !filter) return;
    triggerHaptic('medium');
    try {
      if (isSaved) {
        await unsave.mutateAsync(filter.id);
        toast.success('Filter unsaved');
      } else {
        await save.mutateAsync(filter.id);
        toast.success('Filter saved!');
      }
    } catch {
      toast.error('Failed to save filter');
    }
  };

  const handleUseFilter = () => {
    if (!filter) return;
    triggerHaptic('medium');
    // Navigate to camera with this filter pre-selected
    navigate('/upload', { state: { filterId: filter.id, filterCss: filter.css_filter } });
    onClose();
  };

  const handleShare = async () => {
    if (!filter) return;
    triggerHaptic('light');
    try {
      await navigator.share?.({
        title: `${filter.name} filter on VYBE`,
        url: `${window.location.origin}/filters/${filter.id}`,
      });
    } catch {
      navigator.clipboard?.writeText(`${window.location.origin}/filters/${filter.id}`);
      toast.success('Link copied!');
    }
  };

  return (
    <AnimatePresence>
      {filter && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl max-h-[85vh] overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Close button */}
            <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-muted/50 z-10">
              <X className="w-4 h-4" />
            </button>

            <div className="overflow-y-auto max-h-[calc(85vh-2rem)] pb-safe">
              {/* Filter preview */}
              <div className="relative mx-4 mt-2 aspect-video rounded-2xl overflow-hidden">
                <div
                  className="absolute inset-0 bg-gradient-to-br from-primary/50 via-accent/30 to-secondary/50"
                  style={{ filter: filter.css_filter || 'none' }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-white/60" />
                </div>
              </div>

              {/* Info */}
              <div className="px-4 mt-4">
                <h2 className="text-xl font-display font-bold">{filter.name}</h2>
                {filter.description && (
                  <p className="text-muted-foreground text-sm mt-1">{filter.description}</p>
                )}

                {/* Creator */}
                {filter.creator && (
                  <button
                    onClick={() => { navigate(`/u/${filter.creator!.username}`); onClose(); }}
                    className="flex items-center gap-2 mt-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted overflow-hidden">
                      {filter.creator.avatar_url ? (
                        <img src={filter.creator.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-muted-foreground">
                          {(filter.creator.display_name || filter.creator.username)?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium">{filter.creator.display_name || filter.creator.username}</p>
                      <p className="text-xs text-muted-foreground">@{filter.creator.username}</p>
                    </div>
                  </button>
                )}

                {/* Stats */}
                <div className="flex gap-4 mt-4">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Eye className="w-4 h-4" />
                    <span>{filter.usage_count.toLocaleString()} uses</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Bookmark className="w-4 h-4" />
                    <span>{filter.save_count.toLocaleString()} saves</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-5">
                  <Button
                    onClick={handleUseFilter}
                    className="flex-1 rounded-full font-semibold"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Use Filter
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSave}
                    className="rounded-full"
                  >
                    {isSaved ? (
                      <BookmarkCheck className="w-4 h-4 text-primary" />
                    ) : (
                      <Bookmark className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleShare}
                    className="rounded-full"
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Posts using this filter */}
              {posts.length > 0 && (
                <div className="mt-6 px-4 pb-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Posts using this filter
                  </h3>
                  <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
                    {posts.slice(0, 9).map((post: any) => (
                      <button
                        key={post.id}
                        onClick={() => { navigate(`/p/${post.id}`); onClose(); }}
                        className="aspect-square bg-muted overflow-hidden"
                      >
                        {post.thumbnail_url || post.media_url ? (
                          <img
                            src={post.thumbnail_url || post.media_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
