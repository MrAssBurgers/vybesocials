import { cn } from '@/lib/utils';
import type { DmInboxTabId } from '@/lib/dmInboxOrganize';

const TAB_LABELS: Record<DmInboxTabId, string> = {
  friends: 'Friends',
  groups: 'Groups',
  requests: 'Requests',
  unread: 'Unread',
  calls: 'Calls',
};

export interface DmInboxTabsProps {
  active: DmInboxTabId;
  onChange: (tab: DmInboxTabId) => void;
  badges?: Partial<Record<DmInboxTabId, number>>;
}

export function DmInboxTabs({ active, onChange, badges }: DmInboxTabsProps) {
  const tabs: DmInboxTabId[] = ['friends', 'groups', 'requests', 'unread', 'calls'];

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar mb-1" role="tablist" aria-label="Inbox filters">
      {tabs.map((tab) => {
        const count = badges?.[tab] ?? 0;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => onChange(tab)}
            className={cn('dm-inbox-chip shrink-0', active === tab && 'dm-inbox-chip--active')}
          >
            {count > 0 && tab !== 'friends' && <span className="dm-inbox-chip-dot" />}
            {TAB_LABELS[tab]}
            {count > 0 && (
              <span className="ml-1 text-[10px] opacity-80">{count > 99 ? '99+' : count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
