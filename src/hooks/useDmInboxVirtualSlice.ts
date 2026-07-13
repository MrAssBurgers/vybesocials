import { useCallback } from 'react';
import type { DMInboxRow } from '@/features/dms/dm.types';
import { useVirtualScrollSlice } from '@/hooks/useVirtualScrollSlice';

const ROW_ESTIMATE_PX = 72;

const HEADER_ESTIMATE_PX = 32;
const INBOX_VIRTUAL_THRESHOLD = 40;
const OVERSCAN = 6;

function estimateRowHeight(row: DMInboxRow): number {
  if (row.type === 'header') return HEADER_ESTIMATE_PX;
  return ROW_ESTIMATE_PX;
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
