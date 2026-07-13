import { useCallback } from 'react';
import type { DMInboxRow } from '@/features/dms/dm.types';
import { useVirtualScrollSlice } from '@/hooks/useVirtualScrollSlice';

const ROW_ESTIMATE_PX = 96;
const HEADER_ESTIMATE_PX = 32;
const INBOX_VIRTUAL_THRESHOLD = 40;
const OVERSCAN = 6;

function estimateRowHeight(row: DMInboxRow): number {
  return row.type === 'header' ? HEADER_ESTIMATE_PX : ROW_ESTIMATE_PX;
}

export function useDmInboxVirtualSlice(rows: DMInboxRow[], enabled = true) {
  const estimateHeight = useCallback(
    (row: DMInboxRow) => estimateRowHeight(row),
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
