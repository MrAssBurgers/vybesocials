import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Trash2, UsersRound, UserPlus, Sparkles, Smile } from 'lucide-react';
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

      <div className="relative z-10 px-3 pt-[max(0.5rem,var(--sat,env(safe-area-inset-top)))] pb-2">
        {/* Top bar — single row */}
        <div className="flex items-center gap-2 mb-2">
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
            <Avatar className="relative h-8 w-8 ring-2 ring-background/80 shadow-md">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-primary to-accent text-primary-foreground">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>

          <div className="flex-1 flex items-center gap-1.5 min-w-0">
            <VybeMiniIcon size={14} showSparkles className="text-primary shrink-0" />
            <h1 className="dm-title text-lg font-black tracking-tight shrink-0">
              Messages
            </h1>
            {totalUnreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="dm-unread-orb text-[9px] font-bold tabular-nums shrink-0"
              >
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </motion.span>
            )}
            <StatusPicker
              trigger={
                <Button variant="ghost" size="sm" className="rounded-full gap-1 text-[10px] h-6 px-2 min-w-0 max-w-[7.5rem]">
                  {myStatus ? (
                    <>
                      <span className="shrink-0">{myStatus.emoji}</span>
                      <span className="truncate">{myStatus.text}</span>
                    </>
                  ) : (
                    <>
                      <Smile className="h-3 w-3 shrink-0" />
                      <span className="truncate">Vibe</span>
                    </>
                  )}
                </Button>
              }
            />
          </div>

          <div className="flex items-center gap-0 flex-shrink-0">
            <TrashBin
              open={isTrashOpen}
              onOpenChange={onTrashOpenChange}
              trigger={
                <Button size="icon" variant="ghost" className="dm-icon-btn h-8 w-8 rounded-full">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              }
            />
            <Button
              size="icon"
              variant="ghost"
              className="dm-icon-btn h-8 w-8 rounded-full"
              onClick={onCreateGroup}
            >
              <UsersRound className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="dm-icon-btn dm-icon-btn--accent h-8 w-8 rounded-full"
              onClick={() => navigate('/messages/new')}
            >
              <UserPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
          <Input
            placeholder="Search chats…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dm-search pl-9 h-9 rounded-xl border-0 text-sm"
          />
          <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-primary/40 pointer-events-none" />
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
    <div ref={stripRef} className="dm-filter-strip flex gap-0.5 p-0.5 rounded-xl overflow-x-auto no-scrollbar">
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
              'relative flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors z-[1]',
              isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {isActive && (
              <motion.div
                layoutId="dm-filter-pill"
                className="absolute inset-0 rounded-lg dm-filter-pill-active"
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
