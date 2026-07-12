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
    <div className="dm-inbox-tabs" role="tablist" aria-label="Inbox filters">
      {tabs.map((tab) => {
        const count = badges?.[tab] ?? 0;
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab)}
            className={cn('dm-inbox-tab', isActive && 'dm-inbox-tab--active')}
          >
            <span>{TAB_LABELS[tab]}</span>
            {count > 0 && (
              <span className={cn('dm-inbox-tab-badge', isActive && 'dm-inbox-tab-badge--active')}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
