import { memo } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Community } from '@/hooks/useCommunities';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ServerRailProps {
  communities: (Community & { myRole?: string })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDiscover: () => void;
  unreadCounts?: Record<string, number>;
}

function ServerIcon({
  community,
  isSelected,
  unread,
  onClick,
}: {
  community: Community;
  isSelected: boolean;
  unread: number;
  onClick: () => void;
}) {
  const iconUrl = useSignedUrl(community.icon_url);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          type="button"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          onClick={onClick}
          className="relative group flex items-center justify-center w-full"
          aria-label={community.name}
        >
          <span
            className={cn(
              'absolute left-0 w-1 rounded-r-full bg-foreground transition-all duration-200',
              isSelected ? 'h-10 opacity-100' : 'h-2 opacity-0 group-hover:opacity-100 group-hover:h-5',
            )}
          />
          <span
            className={cn(
              'community-server-icon',
              isSelected && 'community-server-icon--active',
            )}
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="h-full w-full object-cover rounded-[inherit]" />
            ) : (
              <span className="text-sm font-bold text-primary-foreground">
                {community.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          {unread > 0 && (
            <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center border-2 border-[hsl(var(--community-rail))]">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-medium">
        {community.name}
      </TooltipContent>
    </Tooltip>
  );
}

export const ServerRail = memo(function ServerRail({
  communities,
  selectedId,
  onSelect,
  onCreate,
  onDiscover,
  unreadCounts = {},
}: ServerRailProps) {
  return (
    <aside className="community-rail hidden md:flex flex-col items-center py-3 gap-2 shrink-0 w-[72px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.96 }}
            onClick={onDiscover}
            className={cn(
              'community-server-icon community-server-icon--home',
              !selectedId && 'community-server-icon--active',
            )}
            aria-label="Browse communities"
          >
            <span className="text-lg font-black bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
              V
            </span>
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="right">Communities</TooltipContent>
      </Tooltip>

      <div className="w-8 h-[2px] rounded-full bg-foreground/10 my-1" />

      <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto w-full px-2 scrollbar-none">
        {communities.map((c) => (
          <ServerIcon
            key={c.id}
            community={c}
            isSelected={selectedId === c.id}
            unread={unreadCounts[c.id] || 0}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.button
            type="button"
            whileHover={{ scale: 1.06, rotate: 90 }}
            whileTap={{ scale: 0.96 }}
            onClick={onCreate}
            className="community-server-icon community-server-icon--add"
            aria-label="Create community"
          >
            <Plus className="h-5 w-5" />
          </motion.button>
        </TooltipTrigger>
        <TooltipContent side="right">Create Community</TooltipContent>
      </Tooltip>
    </aside>
  );
});
