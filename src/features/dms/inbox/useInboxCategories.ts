import { useCallback, useEffect, useRef, useState } from 'react';
import type { InboxCategory } from '@/features/dms/dm.types';
import {
  INBOX_CATEGORY_SESSION_KEY,
  normalizeInboxCategory,
} from './inboxCategoryModel';

function readStoredCategory(): InboxCategory | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return normalizeInboxCategory(sessionStorage.getItem(INBOX_CATEGORY_SESSION_KEY));
  } catch {
    return null;
  }
}

export function useInboxCategories() {
  const [activeCategory, setActiveCategoryState] = useState<InboxCategory | null>(
    readStoredCategory,
  );
  const chipRefs = useRef<Map<InboxCategory | 'all', HTMLButtonElement | null>>(new Map());

  const setActiveCategory = useCallback((category: InboxCategory | null) => {
    setActiveCategoryState(category);
    try {
      if (category) {
        sessionStorage.setItem(INBOX_CATEGORY_SESSION_KEY, category);
      } else {
        sessionStorage.removeItem(INBOX_CATEGORY_SESSION_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const registerChipRef = useCallback(
    (id: InboxCategory | 'all', node: HTMLButtonElement | null) => {
      if (node) chipRefs.current.set(id, node);
      else chipRefs.current.delete(id);
    },
    [],
  );

  useEffect(() => {
    const key = activeCategory ?? 'all';
    const node = chipRefs.current.get(key);
    node?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCategory]);

  return {
    activeCategory,
    setActiveCategory,
    registerChipRef,
  };
}
