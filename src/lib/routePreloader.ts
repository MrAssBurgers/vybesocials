/**
 * Route Preloader - Ensures instant navigation by preloading page components
 * 
 * This module provides utilities to:
 * 1. Preload lazy-loaded page components on hover/focus
 * 2. Cache preloaded components so they're ready instantly
 * 3. Prefetch data for target routes
 */

// Map of route paths to their lazy import functions
const routeImports: Record<string, () => Promise<any>> = {
  '/home': () => import('@/pages/Home'),
  '/explore': () => import('@/pages/Explore'),
  '/clips': () => import('@/pages/Shorts'),
  '/shorts': () => import('@/pages/Shorts'),
  '/market': () => import('@/pages/Market'),
  '/messages': () => import('@/pages/Messages'),
  '/notifications': () => import('@/pages/Notifications'),
  '/settings': () => import('@/pages/Settings'),
  '/events': () => import('@/pages/Events'),
  '/community': () => import('@/pages/Community'),
  '/spaces': () => import('@/pages/Spaces'),
  '/upload': () => import('@/pages/Upload'),
  '/challenges': () => import('@/pages/ChallengesHub'),
  '/badges': () => import('@/pages/BadgeLibrary'),
  '/business': () => import('@/pages/BusinessPortal'),
  '/howudoin': () => import('@/pages/HowUDoinHub'),
  '/invite-friends': () => import('@/pages/InviteFriends'),
  '/feedback': () => import('@/pages/Feedback'),
  '/admin': () => import('@/pages/AdminDashboard'),
  '/admin/settings': () => import('@/pages/AdminSettings'),
  '/admin/metrics': () => import('@/pages/AdminMetrics'),
  '/marketplace': () => import('@/pages/TokenMarketplace'),
  '/wallet': () => import('@/pages/TokenWallet'),
  '/vybe-dna': () => import('@/pages/VybeDNA'),
  '/leaderboard': () => import('@/pages/Leaderboard'),
  '/streaks': () => import('@/pages/ReactionStreaks'),
  '/roulette': () => import('@/pages/VYBERoulette'),
  '/sounds': () => import('@/pages/Sounds'),
};

// Track which routes have been preloaded
const preloadedRoutes = new Set<string>();

/**
 * Preload a route's component so it's ready for instant navigation
 */
export function preloadRoute(path: string): void {
  // Normalize path
  const normalizedPath = path.split('?')[0].split('#')[0];
  
  // Check if already preloaded
  if (preloadedRoutes.has(normalizedPath)) return;
  
  // Find matching import
  const importFn = routeImports[normalizedPath];
  if (!importFn) {
    // Try to match dynamic routes like /u/:username
    if (normalizedPath.startsWith('/u/')) {
      import('@/pages/Profile').catch(() => {});
      preloadedRoutes.add(normalizedPath);
    } else if (normalizedPath.startsWith('/p/')) {
      import('@/pages/PostDetail').catch(() => {});
      preloadedRoutes.add(normalizedPath);
    } else if (normalizedPath.startsWith('/messages/')) {
      import('@/pages/Messages').catch(() => {});
      preloadedRoutes.add(normalizedPath);
    } else if (normalizedPath.startsWith('/market/')) {
      import('@/pages/ListingDetail').catch(() => {});
      preloadedRoutes.add(normalizedPath);
    }
    return;
  }
  
  // Preload the component
  importFn().catch(() => {});
  preloadedRoutes.add(normalizedPath);
}

/**
 * Preload all critical routes for instant navigation
 * Call this after initial app load
 */
export function preloadCriticalRoutes(): void {
  // Delay slightly to not block initial render
  requestIdleCallback(() => {
    const criticalRoutes = [
      '/home',
      '/explore',
      '/clips',
      '/market',
      '/messages',
      '/notifications',
      '/settings',
      '/events',
    ];
    
    criticalRoutes.forEach(route => {
      preloadRoute(route);
    });

    // Preload Framer Motion chunk so first animated route is instant
    import('framer-motion').catch(() => {});
  }, { timeout: 2000 });
}

/**
 * Preload secondary routes after critical ones
 */
export function preloadSecondaryRoutes(): void {
  requestIdleCallback(() => {
    const secondaryRoutes = [
      '/community',
      '/spaces',
      '/upload',
      '/challenges',
      '/badges',
      '/business',
      '/howudoin',
      '/invite-friends',
      '/feedback',
    ];
    
    secondaryRoutes.forEach(route => {
      preloadRoute(route);
    });
  }, { timeout: 5000 });
}

// Polyfill requestIdleCallback for Safari
if (typeof window !== 'undefined' && !('requestIdleCallback' in window)) {
  (window as any).requestIdleCallback = (cb: Function, options?: { timeout: number }) => {
    const start = Date.now();
    return setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      });
    }, options?.timeout || 1);
  };
}
