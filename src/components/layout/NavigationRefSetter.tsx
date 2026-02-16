import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { navigationRef } from '@/lib/navigationRef';

/**
 * Registers React Router's navigate function globally
 * so non-component code (toasts, notification handlers) can navigate
 * without causing a full page reload.
 */
export function NavigationRefSetter() {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigationRef.current = navigate;
    return () => {
      navigationRef.current = null;
    };
  }, [navigate]);
  
  return null;
}
