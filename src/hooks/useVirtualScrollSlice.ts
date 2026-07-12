import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
  type UIEventHandler,
} from 'react';
import { getAppScrollContainer } from '@/lib/appScrollContainer';

export interface VirtualScrollSliceOptions<T> {
  enabled?: boolean;
  /** Minimum item count before windowing kicks in. */
  threshold?: number;
  estimateHeight: (item: T, index: number) => number;
  overscan?: number;
  /** Own scroll container (e.g. DM thread). */
  scrollRef?: RefObject<HTMLElement | null>;
  /** List wrapper — used with `useAppScroll` to offset into the app `<main>` scroller. */
  listRef?: RefObject<HTMLElement | null>;
  /** Listen to AppLayout main scroll instead of a nested container. */
  useAppScroll?: boolean;
  /** Fired when the viewport is within `endThreshold` px of the list bottom. */
  onNearEnd?: () => void;
  endThreshold?: number;
}

export interface VirtualScrollSliceResult<T> {
  visible: T[];
  visibleStart: number;
  paddingTop: number;
  paddingBottom: number;
  virtualized: boolean;
  onScroll?: UIEventHandler<HTMLDivElement>;
}

function computeSlice<T>(
  items: T[],
  scrollTop: number,
  viewportHeight: number,
  listOffsetTop: number,
  estimateHeight: (item: T, index: number) => number,
  overscan: number,
) {
  const relativeScrollTop = Math.max(0, scrollTop - listOffsetTop);

  let offset = 0;
  let start = 0;
  let end = items.length;

  for (let i = 0; i < items.length; i++) {
    const h = estimateHeight(items[i]!, i);
    if (offset + h > relativeScrollTop) {
      start = Math.max(0, i - overscan);
      break;
    }
    offset += h;
  }

  let visibleBottom = 0;
  for (let i = start; i < items.length; i++) {
    visibleBottom += estimateHeight(items[i]!, i);
    if (visibleBottom > viewportHeight + estimateHeight(items[start]!, start) * overscan) {
      end = Math.min(items.length, i + overscan + 1);
      break;
    }
  }

  let paddingTop = 0;
  for (let i = 0; i < start; i++) paddingTop += estimateHeight(items[i]!, i);

  let total = 0;
  for (let i = 0; i < items.length; i++) total += estimateHeight(items[i]!, i);

  let visibleHeight = 0;
  for (let i = start; i < end; i++) visibleHeight += estimateHeight(items[i]!, i);

  const paddingBottom = Math.max(0, total - paddingTop - visibleHeight);

  return {
    visible: items.slice(start, end),
    visibleStart: start,
    paddingTop,
    paddingBottom,
  };
}

/**
 * Window a long list to visible rows + overscan with spacer padding.
 * Reused by Home feed (app scroll), DM inbox, and chat threads.
 */
export function useVirtualScrollSlice<T>(
  items: T[],
  options: VirtualScrollSliceOptions<T>,
): VirtualScrollSliceResult<T> {
  const {
    enabled = true,
    threshold = 20,
    estimateHeight,
    overscan = 4,
    scrollRef,
    listRef,
    useAppScroll = false,
    onNearEnd,
    endThreshold = 1200,
  } = options;

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );
  const [listOffsetTop, setListOffsetTop] = useState(0);

  const measureListOffset = useCallback(() => {
    if (!useAppScroll || !listRef?.current) {
      setListOffsetTop(0);
      return;
    }
    const container = getAppScrollContainer();
    const list = listRef.current;
    if (!container || !list) return;
    const containerRect = container.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    setListOffsetTop(listRect.top - containerRect.top + container.scrollTop);
  }, [useAppScroll, listRef]);

  useEffect(() => {
    measureListOffset();
    if (!useAppScroll || !listRef?.current) return;
    const ro = new ResizeObserver(measureListOffset);
    ro.observe(listRef.current);
    return () => ro.disconnect();
  }, [measureListOffset, useAppScroll, listRef, items.length]);

  useEffect(() => {
    const el = scrollRef?.current ?? (useAppScroll ? getAppScrollContainer() : null);
    if (!el) return;

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
      measureListOffset();
    };

    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });
    const ro = new ResizeObserver(handleScroll);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      ro.disconnect();
    };
  }, [scrollRef, useAppScroll, measureListOffset]);

  const virtualized = enabled && items.length >= threshold;

  const slice = useMemo(() => {
    if (!virtualized) {
      return {
        visible: items,
        visibleStart: 0,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }
    return computeSlice(
      items,
      scrollTop,
      viewportHeight,
      listOffsetTop,
      estimateHeight,
      overscan,
    );
  }, [virtualized, items, scrollTop, viewportHeight, listOffsetTop, estimateHeight, overscan]);

  useEffect(() => {
    if (!virtualized || !onNearEnd) return;
    let total = 0;
    for (let i = 0; i < items.length; i++) total += estimateHeight(items[i]!, i);
    const relativeScrollTop = Math.max(0, scrollTop - listOffsetTop);
    if (relativeScrollTop + viewportHeight >= total - endThreshold) {
      onNearEnd();
    }
  }, [
    virtualized,
    onNearEnd,
    items,
    scrollTop,
    viewportHeight,
    listOffsetTop,
    estimateHeight,
    endThreshold,
  ]);

  const onScroll = useCallback<UIEventHandler<HTMLDivElement>>(
    (e) => {
      const el = e.currentTarget;
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    },
    [],
  );

  return {
    ...slice,
    virtualized,
    onScroll: scrollRef || !useAppScroll ? onScroll : undefined,
  };
}
