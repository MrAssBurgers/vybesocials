import { useCallback, useMemo, useState } from 'react';
import type { DmInboxRow } from '@/lib/dmInboxOrganize';

const ROW_ESTIMATE_PX = 76;
const HEADER_ESTIMATE_PX = 32;
const OVERSCAN = 6;

function estimateRowHeight(row: DmInboxRow): number {
  return row.type === 'header' ? HEADER_ESTIMATE_PX : ROW_ESTIMATE_PX;
}

export function useDmInboxVirtualSlice(rows: DmInboxRow[], enabled = true) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
  }, []);

  const slice = useMemo(() => {
    if (!enabled || rows.length < 40) {
      return { visible: rows, paddingTop: 0, paddingBottom: 0 };
    }

    let offset = 0;
    let start = 0;
    let end = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const h = estimateRowHeight(rows[i]!);
      if (offset + h > scrollTop) {
        start = Math.max(0, i - OVERSCAN);
        break;
      }
      offset += h;
    }

    let visibleBottom = 0;
    for (let i = start; i < rows.length; i++) {
      visibleBottom += estimateRowHeight(rows[i]!);
      if (visibleBottom > viewportHeight + ROW_ESTIMATE_PX * OVERSCAN) {
        end = Math.min(rows.length, i + OVERSCAN + 1);
        break;
      }
    }

    let paddingTop = 0;
    for (let i = 0; i < start; i++) paddingTop += estimateRowHeight(rows[i]!);

    let total = 0;
    for (const row of rows) total += estimateRowHeight(row);
    let visibleHeight = 0;
    for (let i = start; i < end; i++) visibleHeight += estimateRowHeight(rows[i]!);
    const paddingBottom = Math.max(0, total - paddingTop - visibleHeight);

    return {
      visible: rows.slice(start, end),
      paddingTop,
      paddingBottom,
    };
  }, [enabled, rows, scrollTop, viewportHeight]);

  return { ...slice, onScroll, virtualized: enabled && rows.length >= 40 };
}
