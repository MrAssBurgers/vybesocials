import { useCallback } from 'react';
import type { DmInboxRow } from '@/lib/dmInboxOrganize';
import { useVirtualScrollSlice } from '@/hooks/useVirtualScrollSlice';

const ROW_ESTIMATE_PX = 76;
const HEADER_ESTIMATE_PX = 32;
const INBOX_VIRTUAL_THRESHOLD = 40;
const OVERSCAN = 6;

function estimateRowHeight(row: DmInboxRow): number {
  return row.type === 'header' ? HEADER_ESTIMATE_PX : ROW_ESTIMATE_PX;
}

export function useDmInboxVirtualSlice(rows: DmInboxRow[], enabled = true) {
  const estimateHeight = useCallback(
    (row: DmInboxRow) => estimateRowHeight(row),
    [],
  );

  const { visible, paddingTop, paddingBottom, virtualized, onScroll } = useVirtualScrollSlice(
    rows,
    {
      enabled,
      threshold: INBOX_VIRTUAL_THRESHOLD,
      estimateHeight,
      overscan: OVERSCAN,
    },
  );

  return { visible, paddingTop, paddingBottom, onScroll, virtualized };
}
