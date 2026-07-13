import type { InboxCategory } from '@/features/dms/dm.types';
import { INBOX_CATEGORY_LABELS } from './inboxCategoryModel';
import { InboxCategoryChip } from './InboxCategoryChip';
import { categoriesWithCounts } from './inboxCategoryCounts';
import type { DMInboxBadges } from '@/features/dms/dm.types';

export interface InboxCategoryBarProps {
  activeCategory: InboxCategory | null;
  counts: DMInboxBadges;
  onChange: (category: InboxCategory | null) => void;
  registerChipRef: (id: InboxCategory | 'all', node: HTMLButtonElement | null) => void;
}

export function InboxCategoryBar({
  activeCategory,
  counts,
  onChange,
  registerChipRef,
}: InboxCategoryBarProps) {
  const chips = categoriesWithCounts(counts);

  return (
    <div
      className="dm-inbox-category-bar"
      role="tablist"
      aria-label="Inbox categories"
    >
      <div className="dm-inbox-category-bar__track">
        <InboxCategoryChip
          id="all"
          label={INBOX_CATEGORY_LABELS.all}
          selected={activeCategory === null}
          onClick={() => onChange(null)}
          registerRef={registerChipRef}
        />
        {chips.map(({ id, count }) => (
          <InboxCategoryChip
            key={id}
            id={id}
            label={INBOX_CATEGORY_LABELS[id]}
            count={count}
            selected={activeCategory === id}
            onClick={() => onChange(activeCategory === id ? null : id)}
            registerRef={registerChipRef}
          />
        ))}
      </div>
    </div>
  );
}
