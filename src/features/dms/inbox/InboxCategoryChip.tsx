import { useEffect, useRef } from 'react';
import type { InboxCategory } from '@/features/dms/dm.types';
import { cn } from '@/lib/utils';
import { InboxCategoryCount } from './InboxCategoryCount';

export interface InboxCategoryChipProps {
  id: InboxCategory | 'all';
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
  registerRef: (id: InboxCategory | 'all', node: HTMLButtonElement | null) => void;
}

export function InboxCategoryChip({
  id,
  label,
  count = 0,
  selected,
  onClick,
  registerRef,
}: InboxCategoryChipProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    registerRef(id, ref.current);
    return () => registerRef(id, null);
  }, [id, registerRef]);

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={selected}
      id={`dm-inbox-category-${id}`}
      className={cn(
        'dm-inbox-category-chip',
        selected && 'dm-inbox-category-chip--selected',
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <InboxCategoryCount count={count} />
    </button>
  );
}
