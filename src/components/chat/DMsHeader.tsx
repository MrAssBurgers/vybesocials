import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Trash2, UsersRound, UserPlus, Smile } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusPicker } from '@/components/status/StatusPicker';
import { useBatchUserStatuses, type UserStatus } from '@/hooks/useUserStatus';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { safeMapGet } from '@/lib/persistedCollections';
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
  const profileId = useAuthProfileId();
  const { data: statusMap = new Map() } = useBatchUserStatuses(profileId ? [profileId] : []);
  const myStatus = profileId ? safeMapGet<UserStatus>(statusMap, profileId) : undefined;

  return (
    <header className="dm-header flex-shrink-0 relative">
      {/* Aurora wash behind header */}
      <div className="dm-header-aurora pointer-events-none" aria-hidden />

      <div className="relative z-10 px-4 pt-[max(0.5rem,var(--sat,env(safe-area-inset-top)))] pb-0">
        {/* Top bar */}
        <div className="flex items-center gap-2.5 mb-3">
          <button
            type="button"
            onClick={() => profile && navigate(`/u/${profile.username}`)}
            className="relative flex-shrink-0"
            aria-label="Your profile"
          >
            <Avatar className="h-9 w-9 ring-2 ring-primary/30 shadow-sm">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-[11px] font-bold bg-gradient-to-br from-primary to-accent text-primary-foreground">
                {profile?.username?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <VybeWordmark size="sm" as="h1" />
              {totalUnreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="dm-unread-orb text-[9px] font-bold tabular-nums shrink-0"
                >
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                </motion.span>
              )}
            </div>
            <StatusPicker
              trigger={
                <Button variant="ghost" size="sm" className="h-6 px-0 min-w-0 -ml-1 text-[11px] text-muted-foreground hover:text-foreground">
                  {myStatus ? (
                    <span className="truncate">{myStatus.emoji} {myStatus.text}</span>
                  ) : (
                    <span className="flex items-center gap-1"><Smile className="h-3 w-3" /> Set vibe</span>
                  )}
                </Button>
              }
            />
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
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
        <div className="relative mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none" />
          <Input
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dm-search pl-10 h-10 rounded-full border-0 text-sm"
          />
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
    <div ref={stripRef} className="dm-filter-strip flex overflow-x-auto no-scrollbar -mx-4 px-4">
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
              'dm-filter-tab flex-shrink-0 flex-1 text-center',
              isActive && 'dm-filter-tab--active',
            )}
          >
            <span className="relative z-[1] inline-flex items-center justify-center gap-1">
              {tab.key === 'streaks' && <span className="text-sm leading-none">🔥</span>}
              {tab.label}
            </span>
            {isActive && (
              <motion.div
                layoutId="dm-filter-underline"
                className="dm-filter-tab-underline"
                transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
