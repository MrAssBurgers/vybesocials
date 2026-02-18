/**
 * VYBE Performance Configuration
 * Centralized performance settings for the app
 */

// Detect iOS Safari specifically
export const isIOSSafari = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';
  const isIOS = /iphone|ipad|ipod/.test(ua) || (/mac/.test(platform) && navigator.maxTouchPoints > 1);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua) && !/crios/.test(ua);
  return isIOS && isSafari;
};

// Detect low-end devices
export const isLowEndDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check for extremely limited memory only (< 2GB)
  const memory = (navigator as any).deviceMemory;
  if (memory && memory < 2) return true;
  
  // Check for very slow network
  const connection = (navigator as any).connection;
  if (connection?.effectiveType === 'slow-2g') return true;
  
  // Only truly low-end: single-core devices
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 1) return true;
  
  return false;
};

// Animation settings based on device capability
export const getAnimationConfig = () => {
  const lowEnd = isLowEndDevice();
  
  return {
    // Only disable on truly low-end devices — iOS Safari gets full quality
    enablePageTransitions: !lowEnd,
    enableParallax: !lowEnd,
    enableBackgroundAnimations: !lowEnd,
    enableHoverAnimations: !lowEnd,
    
    // Animation config — same for all capable devices
    pageTransition: lowEnd 
      ? { duration: 0.1 } 
      : { type: 'spring', stiffness: 400, damping: 35 },
    
    animationDuration: lowEnd ? 0.05 : 0.3,
    
    blurAmount: lowEnd ? '0px' : '10px',
    
    isIOSSafari: isIOSSafari(),
    reduceMotion: lowEnd,
  };
};

// Image loading settings
export const getImageConfig = () => {
  const lowEnd = isLowEndDevice();
  const connection = (navigator as any).connection;
  
  return {
    // Load lower quality images on slow connections
    quality: connection?.effectiveType === '4g' ? 'high' : 'medium',
    
    // Lazy load more aggressively on low-end devices
    lazyLoadMargin: lowEnd ? '50px' : '200px',
    
    // Limit concurrent image loads
    maxConcurrentLoads: lowEnd ? 2 : 6,
  };
};

// Cache configuration
export const CACHE_CONFIG = {
  // How long data stays fresh (won't refetch)
  staleTime: 1000 * 60 * 10, // 10 minutes
  
  // How long data stays in cache
  gcTime: 1000 * 60 * 60, // 1 hour
  
  // Prefetch settings
  prefetchStaleTime: 1000 * 60 * 5, // 5 minutes
};

// Debounce/throttle settings
export const TIMING_CONFIG = {
  scrollDebounce: 16, // ~60fps
  inputDebounce: 300,
  searchDebounce: 400,
  resizeDebounce: 100,
  saveDebounce: 1000,
};

// Batch sizes for data loading
export const BATCH_CONFIG = {
  postsPerPage: 20,
  messagesPerPage: 50,
  notificationsPerPage: 30,
  storiesPreload: 10,
};

// Will-change optimization helper
export const willChangeOptimize = (element: HTMLElement | null, properties: string[]) => {
  if (!element) return;
  element.style.willChange = properties.join(', ');
  
  // Remove will-change after animation
  return () => {
    if (element) {
      element.style.willChange = 'auto';
    }
  };
};

// Request idle callback with fallback
export const runWhenIdle = (callback: () => void, timeout = 1000) => {
  if ('requestIdleCallback' in window) {
    return requestIdleCallback(callback, { timeout });
  } else {
    return setTimeout(callback, 0);
  }
};

// Cancel idle callback with fallback
export const cancelIdle = (id: number) => {
  if ('cancelIdleCallback' in window) {
    cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};
