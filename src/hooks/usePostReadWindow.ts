import { useState } from 'react';

/** Only opaque boundaries are retained. Moving between groups is explicit;
 * current posts never disappear merely because infinite scroll loads a page. */
export function usePostReadWindow(scope: string) {
  const [state, setState] = useState<{ scope: string; cursors: (string | undefined)[]; index: number }>({ scope, cursors: [undefined], index: 0 });
  const current = state.scope === scope ? state : { scope, cursors: [undefined], index: 0 };
  return {
    cursor: current.cursors[current.index], hasPreviousWindow: current.index > 0, windowIndex: current.index,
    advance: (cursor: string) => setState({ scope, cursors: [...current.cursors.slice(0, current.index + 1), cursor], index: current.index + 1 }),
    previousWindow: () => setState({ ...current, index: Math.max(0, current.index - 1) }),
    restart: () => setState({ scope, cursors: [undefined], index: 0 }),
  };
}
