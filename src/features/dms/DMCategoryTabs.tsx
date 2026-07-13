import { useMemo, useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  DM_INBOX_FILTERS,
  DM_INBOX_FILTER_LABELS,
} from '@/lib/dmInboxOrganize';
import type { DMInboxBadges, DmInboxFilterId, DmInboxTabId } from './dm.types';

const BADGE_KEY: Partial<Record<string, keyof DMInboxBadges>> = {
  unread: 'unread',
  needs_reply: 'needsReply',
  requests: 'requests',
  best_friends: 'bestFriends',
  nearby: 'nearby',
};

const LEGACY_TABS: Array<{ id: DmInboxTabId; label: string }> = [
  { id: 'friends', label: 'Friends' },
  { id: 'best_friends', label: 'Best Friends' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'groups', label: 'Groups' },
  { id: 'requests', label: 'Requests' },
  { id: 'unread', label: 'Unread' },
];

export interface DMCategoryTabsProps {
  active: DmInboxFilterId | string;
  onChange: (tab: DmInboxTabId) => void;
  badges?: Partial<DMInboxBadges>;
  /** Optional per-profile visibility / order override (redesign mode). */
  visibleFilters?: DmInboxFilterId[];
  /** When false, show pre-redesign Friends/Nearby/Requests tabs. */
  redesignEnabled?: boolean;
}

export function DMCategoryTabs({
  active,
  onChange,
  badges,
  visibleFilters,
  redesignEnabled = false,
}: DMCategoryTabsProps) {
  const filters = useMemo(() => {
    if (!redesignEnabled) {
      return LEGACY_TABS.map((t) => t.id);
    }
    return visibleFilters?.length ? visibleFilters : DM_INBOX_FILTERS;
  }, [redesignEnabled, visibleFilters]);

  const labelFor = (id: string) => {
    if (redesignEnabled && id in DM_INBOX_FILTER_LABELS) {
      return DM_INBOX_FILTER_LABELS[id as DmInboxFilterId];
    }
    return LEGACY_TABS.find((t) => t.id === id)?.label || id;
  };

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusAndActivate = (index: number) => {
    const clamped = (index + filters.length) % filters.length;
    const id = filters[clamped];
    tabRefs.current[clamped]?.focus();
    onChange(id as DmInboxTabId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusAndActivate(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusAndActivate(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAndActivate(0);
        break;
      case 'End':
        event.preventDefault();
        focusAndActivate(filters.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <nav className="dm-inbox-tabs-wrap" aria-label="Message filters">
      <div className="dm-inbox-tabs" role="tablist" aria-orientation="horizontal">
        {filters.map((id, index) => {
          const selected = active === id;
          const badgeKey = BADGE_KEY[id];
          const count = badgeKey ? badges?.[badgeKey] ?? 0 : 0;
          return (
            <button
              key={id}
              ref={(node) => { tabRefs.current[index] = node; }}
              type="button"
              role="tab"
              id={`dm-inbox-tab-${id}`}
              aria-selected={selected}
              aria-controls="dm-inbox-list"
              tabIndex={selected ? 0 : -1}
              className={cn('dm-inbox-tab', selected && 'dm-inbox-tab--active')}
              onClick={() => onChange(id as DmInboxTabId)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span>{labelFor(id)}</span>
              {count > 0 && (
                <span className="dm-inbox-tab-badge">
                  {count > 99 ? '99+' : count}
                  <span className="sr-only"> unread</span>
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
