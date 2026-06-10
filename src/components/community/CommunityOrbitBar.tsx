import { memo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Community } from '@/hooks/useCommunities';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface CommunityOrbitBarProps {
  communities: (Community & { myRole?: string })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDiscover: () => void;
  unreadCounts?: Record<string, number>;
  compact?: boolean;
}

function OrbitOrb({
  community,
  isSelected,
  unread,
  onClick,
  size = 'md',
}: {
  community?: Community;
  isSelected: boolean;
  unread?: number;
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  const iconUrl = useSignedUrl(community?.icon_url);
  const dim = size === 'sm' ? 'h-11 w-11' : 'h-14 w-14';

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.05, y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="relative flex flex-col items-center gap-1 shrink-0"
    >
      <span
        className={cn(
          'community-orbit-orb',
          dim,
          isSelected && 'community-orbit-orb--active',
        )}
      >
        {iconUrl ? (
          <img src={iconUrl} alt="" className="h-full w-full object-cover rounded-[inherit]" />
        ) : community ? (
          <span className="text-xs font-black text-primary-foreground">
            {community.name.slice(0, 2).toUpperCase()}
          </span>
        ) : (
          <Sparkles className="h-5 w-5 text-primary" />
        )}
      </span>
      {community && (
        <span className={cn(
          'max-w-[64px] truncate text-[10px] font-semibold',
          isSelected ? 'text-primary' : 'text-muted-foreground',
        )}>
          {community.name.split(' ')[0]}
        </span>
      )}
      {(unread ?? 0) > 0 && (
        <span className="absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center border-2 border-background">
          {unread! > 99 ? '99+' : unread}
        </span>
      )}
    </motion.button>
  );
}

export const CommunityOrbitBar = memo(function CommunityOrbitBar({
  communities,
  selectedId,
  onSelect,
  onCreate,
  onDiscover,
  unreadCounts = {},
  compact,
}: CommunityOrbitBarProps) {
  return (
    <div className={cn('community-orbit-bar', compact && 'community-orbit-bar--compact')}>
      <div className="flex items-end gap-3 overflow-x-auto scrollbar-none px-1 py-1">
        <OrbitOrb
          isSelected={!selectedId}
          onClick={onDiscover}
          size={compact ? 'sm' : 'md'}
        />

        {communities.map((c) => (
          <OrbitOrb
            key={c.id}
            community={c}
            isSelected={selectedId === c.id}
            unread={unreadCounts[c.id]}
            onClick={() => onSelect(c.id)}
            size={compact ? 'sm' : 'md'}
          />
        ))}

        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onCreate}
          className="flex flex-col items-center gap-1 shrink-0"
          aria-label="Create community"
        >
          <span className={cn('community-orbit-orb community-orbit-orb--add', compact ? 'h-11 w-11' : 'h-14 w-14')}>
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">New</span>
        </motion.button>
      </div>
    </div>
  );
});
