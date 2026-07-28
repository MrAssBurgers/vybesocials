/**
 * Route Preloader - Ensures instant navigation by preloading page components
 * 
 * This module provides utilities to:
 * 1. Preload lazy-loaded page components on hover/focus
 * 2. Cache preloaded components so they're ready instantly
 * 3. Prefetch data for target routes
 */

import '@/lib/idleCallbackPolyfill';
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

const PRIMARY_TAB_ROUTES = [
  '/home',
  '/explore',
  '/clips',
  '/market',
  '/messages',
  '/notifications',
  '/settings',
] as const;

// Track which routes have been preloaded
const preloadedRoutes = new Set<string>();

/** Respect the user's data-saver setting and avoid competing with the visible page. */
function shouldLimitBackgroundPreload(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.onLine) return true;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  return Boolean(
    connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g',
  );
}

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
    if (normalizedPath.startsWith('/u/') || normalizedPath === '/profile') {
      import('@/pages/Profile').catch(() => {});
      preloadedRoutes.add(normalizedPath);
    } else if (normalizedPath.startsWith('/p/')) {
      import('@/pages/PostDetail').catch(() => {});
      preloadedRoutes.add(normalizedPath);
    } else if (normalizedPath.startsWith('/messages/')) {
      import('@/pages/Messages').catch(() => {});
      import('@/components/chat/ChatView').catch(() => {});
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

function resolveActiveTabRoute(pathname: string): string {
  const path = pathname.split('?')[0].split('#')[0];
  const match = PRIMARY_TAB_ROUTES.find(
    (route) => path === route || path.startsWith(`${route}/`),
  );
  return match ?? '/home';
}

function neighborTabRoutes(activeRoute: string): string[] {
  const idx = PRIMARY_TAB_ROUTES.indexOf(activeRoute as (typeof PRIMARY_TAB_ROUTES)[number]);
  if (idx < 0) return [];
  const neighbors: string[] = [];
  if (idx > 0) neighbors.push(PRIMARY_TAB_ROUTES[idx - 1]);
  if (idx < PRIMARY_TAB_ROUTES.length - 1) neighbors.push(PRIMARY_TAB_ROUTES[idx + 1]);
  return neighbors;
}

/**
 * Preload critical routes for instant navigation — staggered so splash hydration wins.
 */
export function preloadCriticalRoutes(): void {
  if (typeof window === 'undefined') return;

  const activeRoute = resolveActiveTabRoute(window.location.pathname);
  preloadRoute(activeRoute);

  // The current screen is the only speculative download worth making while
  // offline, on 2G, or when the user explicitly enabled Data Saver.
  if (shouldLimitBackgroundPreload()) return;

  const neighbors = neighborTabRoutes(activeRoute);
  const ric = window.requestIdleCallback?.bind(window);
  const schedule = (fn: () => void, timeout: number) => {
    if (typeof ric === 'function') {
      ric(fn, { timeout });
      return;
    }
    window.setTimeout(fn, Math.min(timeout, 400));
  };

  schedule(() => {
    neighbors.forEach((route) => preloadRoute(route));
  }, 1200);

  schedule(() => {
    PRIMARY_TAB_ROUTES.forEach((route, index) => {
      if (route === activeRoute || neighbors.includes(route)) return;
      window.setTimeout(() => preloadRoute(route), index * 180);
    });
    preloadRoute('/events');
  }, 2800);
}

/**
 * Preload secondary routes after critical ones
 */
export function preloadSecondaryRoutes(): void {
  if (typeof window === 'undefined' || shouldLimitBackgroundPreload()) return;
  const run = () => {
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

    secondaryRoutes.forEach((route, index) => {
      window.setTimeout(() => preloadRoute(route), index * 220);
    });
  };

  const ric = window.requestIdleCallback?.bind(window);
  if (typeof ric === 'function') {
    ric(run, { timeout: 5000 });
    return;
  }
  window.setTimeout(run, 400);
}
