import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { MOTION_VARIANTS } from '@/lib/motion';
import { InteractiveButton } from './InteractiveButton';

interface EmptyStateProps {
  icon?: ReactNode;
  emoji?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  emoji,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      variants={MOTION_VARIANTS.fadeUp}
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4 text-center',
        className
      )}
    >
      {/* Icon/Emoji */}
      {emoji ? (
        <motion.span
          className="text-6xl mb-4"
          animate={{ 
            y: [0, -8, 0],
            rotate: [-5, 5, -5],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          {emoji}
        </motion.span>
      ) : icon ? (
        <motion.div
          className="text-muted-foreground mb-4"
          animate={{ 
            scale: [1, 1.05, 1],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        >
          {icon}
        </motion.div>
      ) : null}

      {/* Title */}
      <h3 className="text-lg font-semibold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] mb-2">
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] max-w-xs mb-6">
          {description}
        </p>
      )}

      {/* Action Button */}
      {actionLabel && onAction && (
        <InteractiveButton
          onClick={onAction}
          className="gradient-animated"
          hapticStyle="medium"
        >
          {actionLabel}
        </InteractiveButton>
      )}
    </motion.div>
  );
}

// Pre-built empty states for common scenarios
export function EmptyFeed({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState
      emoji="📸"
      title="No posts yet"
      description="Be the first to share something amazing with the community!"
      actionLabel="Explore"
      onAction={onExplore}
    />
  );
}

export function EmptyMessages({ onNewMessage }: { onNewMessage?: () => void }) {
  return (
    <EmptyState
      emoji="💬"
      title="No messages"
      description="Start a conversation with someone!"
      actionLabel="New Message"
      onAction={onNewMessage}
    />
  );
}

export function EmptyNotifications() {
  return (
    <EmptyState
      emoji="🔔"
      title="All caught up!"
      description="You have no new notifications. Check back later!"
    />
  );
}

export function EmptySearch({ query }: { query?: string }) {
  return (
    <EmptyState
      emoji="🔍"
      title="No results"
      description={query ? `No results found for "${query}"` : 'Try searching for something'}
    />
  );
}

export function EmptyFollowing({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState
      emoji="👀"
      title="Nothing here yet"
      description="Follow creators to see their posts here!"
      actionLabel="Discover Creators"
      onAction={onExplore}
    />
  );
}

export function EmptySaved({ onExplore }: { onExplore?: () => void }) {
  return (
    <EmptyState
      emoji="🔖"
      title="No saved posts"
      description="Save posts to view them later!"
      actionLabel="Browse Feed"
      onAction={onExplore}
    />
  );
}

export function OfflineBanner() {
  return (
    <motion.div
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -50, opacity: 0 }}
      className="fixed top-0 left-0 right-0 z-50 bg-yellow-500/90 text-yellow-900 py-2 px-4 text-center text-sm font-medium backdrop-blur-sm"
    >
      📡 You're offline. Some features may be limited.
    </motion.div>
  );
}
