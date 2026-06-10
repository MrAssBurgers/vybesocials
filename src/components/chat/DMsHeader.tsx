import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Trash2, UsersRound, UserPlus, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { StatusPicker, getVibeColor } from '@/components/status/StatusPicker';
import { useBatchUserStatuses } from '@/hooks/useUserStatus';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { TrashBin } from './TrashBin';

export type DMChatFilter = 'all' | 'unread' | 'groups' | 'streaks';

const FILTER_TABS: { key: DMChatFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'groups', label: 'Groups' },
  { key: 'streaks', label: 'Streaks' },
];

interface DMsHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  chatFilter: DMChatFilter;
  onFilterChange: (filter: DMChatFilter) => void;
  totalUnreadCount: number;
  isTrashOpen: boolean;
  onTrashOpenChange: (open: boolean) => void;
  onCreateGroup: () => void;
}

export function DMsHeader({
  searchQuery,
  onSearchChange,
  chatFilter,
  onFilterChange,
  totalUnreadCount,
  isTrashOpen,
  onTrashOpenChange,
  onCreateGroup,
}: DMsHeaderProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: statusMap = new Map() } = useBatchUserStatuses(profile?.user_id ? [profile.user_id] : []);
  const myStatus = profile?.user_id ? statusMap.get(profile.user_id) : undefined;
  const vibeColor = myStatus ? getVibeColor(myStatus.emoji) : undefined;

  return (
    <header className="dm-header flex-shrink-0 relative">
      {/* Aurora wash behind header */}
      <div className="dm-header-aurora pointer-events-none" aria-hidden />

      <div className="relative z-10 px-4 pt-[max(0.75rem,var(--sat,env(safe-area-inset-top)))] pb-3">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            type="button"
            onClick={() => profile && navigate(`/u/${profile.username}`)}
            className="relative flex-shrink-0 group"
            aria-label="Your profile"
          >
            <div
              className="absolute -inset-0.5 rounded-full opacity-60 blur-md transition-opacity group-active:opacity-100"
              style={{
                background: vibeColor
                  ? `linear-gradient(135deg, ${vibeColor}, hsl(var(--accent)))`
                  : 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              }}
            />
            <Avatar className="relative h-10 w-10 ring-2 ring-background/80 shadow-lg">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-primary to-accent text-primary-foreground">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>

          <div className="flex-1 flex flex-col items-center min-w-0">
            <div className="flex items-center gap-1.5">
              <VybeMiniIcon size={16} showSparkles className="text-primary shrink-0" />
              <h1 className="dm-title text-xl font-black tracking-tight">
                Messages
              </h1>
              {totalUnreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="dm-unread-orb text-[10px] font-bold tabular-nums"
                >
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </motion.span>
              )}
            </div>
            <StatusPicker />
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <TrashBin
              open={isTrashOpen}
              onOpenChange={onTrashOpenChange}
              trigger={
                <Button size="icon" variant="ghost" className="dm-icon-btn h-9 w-9 rounded-full">
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
            />
            <Button
              size="icon"
              variant="ghost"
              className="dm-icon-btn h-9 w-9 rounded-full"
              onClick={onCreateGroup}
            >
              <UsersRound className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="dm-icon-btn dm-icon-btn--accent h-9 w-9 rounded-full"
              onClick={() => navigate('/messages/new')}
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Glass search */}
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
          <Input
            placeholder="Search vibes & chats…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dm-search pl-10 h-10 rounded-2xl border-0 text-sm"
          />
          <Sparkles className="absolute right-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/40 pointer-events-none" />
        </div>

        {/* Filter strip */}
        <DMFilterStrip active={chatFilter} onChange={onFilterChange} />
      </div>
    </header>
  );
}

function DMFilterStrip({
  active,
  onChange,
}: {
  active: DMChatFilter;
  onChange: (f: DMChatFilter) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-filter="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <div ref={stripRef} className="dm-filter-strip flex gap-1 p-1 rounded-2xl overflow-x-auto no-scrollbar">
      {FILTER_TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            data-filter={tab.key}
            onClick={() => {
              haptics.tap();
              onChange(tab.key);
            }}
            className={cn(
              'relative flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold transition-colors z-[1]',
              isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="dm-filter-pill"
                className="absolute inset-0 rounded-xl dm-filter-pill-active"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.45 }}
              />
            )}
            <span className="relative z-[1] flex items-center gap-1">
              {tab.key === 'streaks' && <span className="text-sm leading-none">🔥</span>}
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
