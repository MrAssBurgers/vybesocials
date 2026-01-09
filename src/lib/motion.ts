// Global Motion System - Unified animation utilities
// Provides consistent easing, duration, and spring configs

export const MOTION_CONFIG = {
  // Spring configs for different use cases
  spring: {
    snappy: { type: 'spring', stiffness: 500, damping: 30 } as const,
    gentle: { type: 'spring', stiffness: 300, damping: 25 } as const,
    bouncy: { type: 'spring', stiffness: 400, damping: 15 } as const,
    slow: { type: 'spring', stiffness: 200, damping: 20 } as const,
  },
  
  // Duration presets (in seconds)
  duration: {
    instant: 0.1,
    fast: 0.15,
    normal: 0.25,
    slow: 0.4,
    glacial: 0.6,
  },
  
  // Easing presets
  ease: {
    default: [0.4, 0, 0.2, 1] as const,
    out: [0, 0, 0.2, 1] as const,
    in: [0.4, 0, 1, 1] as const,
    bounce: [0.34, 1.56, 0.64, 1] as const,
  },
} as const;

// Pre-built animation variants for common patterns
export const MOTION_VARIANTS = {
  // Fade in/out
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: MOTION_CONFIG.duration.normal },
  },
  
  // Fade and slide up
  fadeUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: MOTION_CONFIG.spring.snappy,
  },
  
  // Scale in/out
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: MOTION_CONFIG.spring.snappy,
  },
  
  // Slide from right
  slideRight: {
    initial: { x: '100%' },
    animate: { x: 0 },
    exit: { x: '100%' },
    transition: MOTION_CONFIG.spring.gentle,
  },
  
  // Slide from bottom
  slideUp: {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
    transition: MOTION_CONFIG.spring.gentle,
  },
  
  // Pop effect for buttons/likes
  pop: {
    initial: { scale: 1 },
    tap: { scale: 0.95 },
    hover: { scale: 1.02 },
  },
  
  // Like button heart pop
  heartPop: {
    initial: { scale: 1 },
    animate: { 
      scale: [1, 1.3, 0.9, 1.1, 1],
      transition: { duration: 0.4 }
    },
  },
  
  // Save button fold
  saveFold: {
    initial: { rotateX: 0 },
    animate: { 
      rotateX: [0, -30, 0],
      transition: { duration: 0.3 }
    },
  },
  
  // Share button fly
  shareFly: {
    initial: { x: 0, y: 0, opacity: 1 },
    animate: { 
      x: [0, 20, 0],
      y: [0, -10, 0],
      opacity: [1, 0.5, 1],
      transition: { duration: 0.4 }
    },
  },
  
  // Stagger children
  stagger: {
    animate: {
      transition: {
        staggerChildren: 0.05,
      },
    },
  },
  
  // List item for staggered lists
  listItem: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
    transition: { duration: MOTION_CONFIG.duration.fast },
  },
};

// Gesture configs
export const GESTURE_CONFIG = {
  // Swipe threshold in pixels
  swipeThreshold: 50,
  
  // Long press duration in ms
  longPressDuration: 500,
  
  // Pull to refresh threshold
  pullThreshold: 80,
};

// Animation budget tracking
let animatedElementsCount = 0;
const MAX_ANIMATED_ELEMENTS = 2;

export function registerAnimatedElement(): boolean {
  if (animatedElementsCount >= MAX_ANIMATED_ELEMENTS) {
    console.warn('Animation budget exceeded - element will be static');
    return false;
  }
  animatedElementsCount++;
  return true;
}

export function unregisterAnimatedElement(): void {
  animatedElementsCount = Math.max(0, animatedElementsCount - 1);
}

export function getAnimatedElementsCount(): number {
  return animatedElementsCount;
}

export function resetAnimationBudget(): void {
  animatedElementsCount = 0;
}

// Check if user prefers reduced motion
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Get appropriate transition based on reduced motion preference
export function getTransition(normal: any, reduced: any = { duration: 0.01 }) {
  return prefersReducedMotion() ? reduced : normal;
}
