import { createRef } from 'react';
import type { NavigateFunction } from 'react-router-dom';

/**
 * Global navigation ref - allows navigating from outside React components
 * (e.g., notification click handlers, toast callbacks)
 * Set this in your root component using useNavigate()
 */
export const navigationRef: React.MutableRefObject<NavigateFunction | null> = createRef<NavigateFunction | null>() as any;
navigationRef.current = null;
