import { cn } from '@/lib/utils';
import type { DMInboxBadges, DmInboxTabId } from './dm.types';

const TABS: Array<{ id: DmInboxTabId; label: string; badgeKey?: keyof DMInboxBadges }> = [
  { id: 'friends', label: 'Friends' },
  { id: 'best_friends', label: 'Best Friends', badgeKey: 'bestFriends' },
  { id: 'nearby', label: 'Nearby', badgeKey: 'nearby' },
  { id: 'groups', label: 'Groups' },
  { id: 'requests', label: 'Requests', badgeKey: 'requests' },
  { id: 'unread', label: 'Unread', badgeKey: 'unread' },
];

export interface DMCategoryTabsProps {
  active: DmInboxTabId;
  onChange: (tab: DmInboxTabId) => void;
  badges?: Partial<DMInboxBadges>;
}

export function DMCategoryTabs({ active, onChange, badges }: DMCategoryTabsProps) {
  return (
    <nav className="dm-inbox-tabs-wrap" aria-label="Chat categories">
      <div className="dm-inbox-tabs" role="tablist">
        {TABS.map(({ id, label, badgeKey }) => {
          const selected = active === id;
          const count = badgeKey ? badges?.[badgeKey] ?? 0 : 0;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn('dm-inbox-tab', selected && 'dm-inbox-tab--active')}
              onClick={() => onChange(id)}
            >
              <span>{label}</span>
              {count > 0 && (
                <span className="dm-inbox-tab-badge">
                  {count > 99 ? '99+' : count}
                </span>
              )}
              <span className="dm-inbox-tab-glow" aria-hidden />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
