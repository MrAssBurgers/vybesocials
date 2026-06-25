import { forwardRef, useCallback } from 'react';
import { Link, LinkProps, useNavigate } from 'react-router-dom';
import { preloadRoute } from '@/lib/routePreloader';

interface PrefetchLinkProps extends Omit<LinkProps, 'prefetch'> {
  prefetch?: boolean;
}

/**
 * Enhanced Link component that preloads the target route on hover/focus
 * This ensures instant navigation with zero delay
 */
export const PrefetchLink = forwardRef<HTMLAnchorElement, PrefetchLinkProps>(
  ({ to, prefetch = true, onMouseEnter, onFocus, children, ...props }, ref) => {
    const path = typeof to === 'string' ? to : to.pathname || '';
    
    const handlePreload = useCallback(() => {
      if (prefetch && path) {
        preloadRoute(path);
      }
    }, [prefetch, path]);
    
    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
      handlePreload();
      onMouseEnter?.(e);
    }, [handlePreload, onMouseEnter]);
    
    const handleFocus = useCallback((e: React.FocusEvent<HTMLAnchorElement>) => {
      handlePreload();
      onFocus?.(e);
    }, [handlePreload, onFocus]);
    
    return (
      <Link
        ref={ref}
        to={to}
        onMouseEnter={handleMouseEnter}
        onFocus={handleFocus}
        {...props}
      >
        {children}
      </Link>
    );
  }
);

PrefetchLink.displayName = 'PrefetchLink';

/**
 * Hook for programmatic navigation with preloading
 */
export function usePrefetchNavigate() {
  const navigate = useNavigate();
  
  const prefetchNavigate = useCallback((to: string, options?: { replace?: boolean }) => {
    // Preload immediately
    preloadRoute(to);
    // Navigate without waiting (component is already loading)
    navigate(to, options);
  }, [navigate]);
  
  return prefetchNavigate;
}
