import { useEffect, useRef } from 'react';

interface SheetEntry {
  id: string;
  close: () => void;
}

const stack: SheetEntry[] = [];
let listening = false;
let suppressNextPop = false;

function ensureListener() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('popstate', () => {
    if (suppressNextPop) {
      suppressNextPop = false;
      return;
    }
    const top = stack.pop();
    top?.close();
  });
}

/**
 * Gives drawers LIFO browser/Android-back behavior without changing routes.
 * Vaul continues to own Escape, overlay click, focus trapping, and swipe-down.
 */
export function useSheetBackStack(open: boolean, close: () => void, id: string) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    ensureListener();

    const entry: SheetEntry = { id, close: () => closeRef.current() };
    stack.push(entry);
    window.history.pushState(
      { ...(window.history.state || {}), vybeSheetId: id },
      '',
      window.location.href,
    );

    return () => {
      const index = stack.findIndex((candidate) => candidate.id === id);
      if (index < 0) return;
      const wasTop = index === stack.length - 1;
      stack.splice(index, 1);
      if (wasTop && window.history.state?.vybeSheetId === id) {
        suppressNextPop = true;
        window.history.back();
      }
    };
  }, [id, open]);
}

export function openSheetCountForTests(): number {
  return stack.length;
}
