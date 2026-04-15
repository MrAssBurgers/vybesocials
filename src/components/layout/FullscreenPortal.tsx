import { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface FullscreenPortalProps {
  children: ReactNode;
}

export function FullscreenPortal({ children }: FullscreenPortalProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
