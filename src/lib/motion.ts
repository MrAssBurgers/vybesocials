// Global Motion System - Unified animation utilities
// Provides consistent easing, duration, and spring configs

export const MOTION_CONFIG = {
  // Spring configs - Apple-style liquid physics
  spring: {
    snappy: { type: 'spring', stiffness: 400, damping: 28 } as const,
    gentle: { type: 'spring', stiffness: 250, damping: 22 } as const,
    bouncy: { type: 'spring', stiffness: 350, damping: 18 } as const,
    slow: { type: 'spring', stiffness: 180, damping: 22 } as const,
    liquid: { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 } as const,
    liquidSoft: { type: 'spring', stiffness: 180, damping: 22 } as const,
    // Magnetic = high-stiffness, low-overshoot — for shared layoutId indicators
    magnetic: { type: 'spring', stiffness: 500, damping: 35, mass: 0.8 } as const,
    // Tactile = button press feedback
    tactile: { type: 'spring', stiffness: 600, damping: 30 } as const,
  },

  // Duration presets (in seconds) — flagship app standard
  duration: {
    instant: 0.1,
    fast: 0.15,
    normal: 0.22,
    slow: 0.3,
    glacial: 0.45,
  },

  // Easing presets — EASE_OUT_EXPO is the project standard
  ease: {
    default: [0.4, 0, 0.2, 1] as const,
    out: [0, 0, 0.2, 1] as const,
    in: [0.4, 0, 1, 1] as const,
    bounce: [0.34, 1.56, 0.64, 1] as const,
    // Project standard — premium, smooth deceleration
    expoOut: [0.16, 1, 0.3, 1] as const,
  },
} as const;

// Common transition shorthands (use directly in `transition={...}`)
export const T = {
  tap: { duration: MOTION_CONFIG.duration.fast },
  press: MOTION_CONFIG.spring.tactile,
  indicator: MOTION_CONFIG.spring.magnetic,
  enter: { duration: MOTION_CONFIG.duration.normal, ease: MOTION_CONFIG.ease.expoOut },
  sheet: MOTION_CONFIG.spring.liquid,
} as const;

// Whole-button tap interaction — apply via `{...TAP}`
export const TAP = {
  whileTap: { scale: 0.94 },
  transition: T.press,
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
  
  // Fade and slide up - liquid spring
  fadeUp: {
    initial: { opacity: 0, y: 12, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 12, scale: 0.99 },
    transition: MOTION_CONFIG.spring.liquid,
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
