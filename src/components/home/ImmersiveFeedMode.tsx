import { memo, useRef, useCallback, useState } from 'react';
import { PostCard } from '@/components/posts/PostCard';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { Post } from '@/hooks/useInfinitePosts';

interface ImmersiveFeedModeProps {
  posts: Post[];
  loadMoreRef: (node: HTMLDivElement | null) => void;
}

/**
 * Immersive snap-to-card feed mode.
 * Each post fills the viewport with a frosted glass container.
 * Snaps to the next card on scroll.
 */
export const ImmersiveFeedMode = memo(function ImmersiveFeedMode({ posts, loadMoreRef }: ImmersiveFeedModeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (posts.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="snap-y snap-mandatory h-[calc(100vh-140px)] overflow-y-auto no-scrollbar"
      style={{ scrollBehavior: 'smooth' }}
    >
      {posts.map((post) => (
        <div
          key={post.id}
          className="snap-start snap-always h-[calc(100vh-140px)] flex items-center justify-center px-3 py-2"
        >
          <div className="w-full max-w-lg rounded-2xl bg-card/95 border border-border/30 shadow-xl overflow-hidden">
            <PostCard post={post} />
          </div>
        </div>
      ))}
      <div ref={loadMoreRef} className="h-10" />
    </div>
  );
});

/**
 * Toggle button for switching between list and immersive mode
 */
export function ImmersiveToggle({ 
  isImmersive, 
  onToggle 
}: { 
  isImmersive: boolean; 
  onToggle: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onToggle}
      className={cn(
        "p-1.5 rounded-lg transition-colors",
        isImmersive 
          ? "bg-primary/15 text-primary" 
          : "text-muted-foreground hover:text-foreground"
      )}
      title={isImmersive ? "List view" : "Immersive view"}
    >
      {isImmersive ? (
        <Minimize2 className="h-4 w-4" />
      ) : (
        <Maximize2 className="h-4 w-4" />
      )}
    </motion.button>
  );
}
