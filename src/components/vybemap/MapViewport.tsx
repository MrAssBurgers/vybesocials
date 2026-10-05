import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Route transitions establish a fixed-position containing block. Keep the map
 * at the viewport while retaining its router, auth and query React contexts. */
export function MapViewport({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-40" style={{ height: '100dvh' }} data-map-viewport>
      {children}
    </div>,
    document.body,
  );
}
