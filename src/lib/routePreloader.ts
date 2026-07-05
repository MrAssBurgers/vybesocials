/**
 * Route Preloader - Ensures instant navigation by preloading page components
 * 
 * This module provides utilities to:
 * 1. Preload lazy-loaded page components on hover/focus
 * 2. Cache preloaded components so they're ready instantly
 * 3. Prefetch data for target routes
 */

import { prefetchDMConversationsFromNav } from '@/lib/loadDMConversations';

// Map of route paths to their lazy import functions
const routeImports: Record<string, () => Promise<any>> = {
  '/home': () => import('@/pages/Home'),
  '/explore': () => import('@/pages/Explore'),
  '/clips': () => import('@/pages/Shorts'),
  '/market': () => import('@/pages/Market'),
  '/messages': () => import('@/pages/Messages'),
  '/notifications': () => import('@/pages/Notifications'),
  '/settings': () => import('@/pages/Settings'),
  '/events': () => import('@/pages/Events'),
  '/community': () => import('@/pages/Community'),
  '/spaces': () => import('@/pages/VYBESpaces'),
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
  '/map': () => import('@/pages/VybeMap'),
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
      prefetchDMConversationsFromNav();
    } else if (normalizedPath.startsWith('/market/')) {
      import('@/pages/ListingDetail').catch(() => {});
      preloadedRoutes.add(normalizedPath);
    }
    return;
  }
  
  // Preload the component
  importFn().catch(() => {});
  preloadedRoutes.add(normalizedPath);

  if (normalizedPath === '/messages' || normalizedPath.startsWith('/messages/')) {
    prefetchDMConversationsFromNav();
  }
}

/**
 * Preload all critical routes for instant navigation
 * Call this after initial app load
 */
export function preloadCriticalRoutes(): void {
  const criticalRoutes = [
    '/messages',
    '/home',
    '/explore',
    '/clips',
    '/market',
    '/notifications',
    '/settings',
    '/events',
  ];

  // Start immediately — don't wait for idle (routes were loading 2s late).
  criticalRoutes.forEach((route) => preloadRoute(route));
  import('framer-motion').catch(() => {});

  requestIdleCallback(() => {
    criticalRoutes.forEach((route) => preloadRoute(route));
  }, { timeout: 800 });
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
      '/map',
    ];
    
    secondaryRoutes.forEach(route => {
      preloadRoute(route);
    });
  }, { timeout: 5000 });
}

// Polyfill requestIdleCallback for Safari
if (typeof window !== 'undefined' && !('requestIdleCallback' in window)) {
  (window as Window & { requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number }).requestIdleCallback = (cb, options) => {
    const start = Date.now();
    return setTimeout(() => {
      cb({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      });
    }, options?.timeout || 1) as unknown as number;
  };
}
