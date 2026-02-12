// Apple-style Liquid Motion System
// Unified spring physics, variants, and micro-interaction presets

// === Spring Configs ===
export const liquidSpring = {
  type: 'spring' as const,
  stiffness: 260,
  damping: 24,
  mass: 0.9,
};

export const liquidSoftSpring = {
  type: 'spring' as const,
  stiffness: 180,
  damping: 22,
};

export const liquidSnappySpring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 28,
};

export const liquidBouncySpring = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 16,
  mass: 0.8,
};

// === Page / Section Variants ===
export const liquidFadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: liquidSpring,
};

export const liquidPop = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: liquidSpring,
};

export const liquidSlideUp = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
  transition: liquidSoftSpring,
};

export const liquidSlideRight = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%' },
  transition: liquidSoftSpring,
};

// === Micro-Interaction Presets ===
export const liquidButton = {
  whileHover: { scale: 1.03 },
  whileTap: { scale: 0.94 },
  transition: liquidSnappySpring,
};

export const liquidIcon = {
  whileHover: { rotate: 2, scale: 1.08 },
  whileTap: { scale: 0.9 },
  transition: liquidSnappySpring,
};

export const liquidCard = {
  whileHover: { y: -3, scale: 1.01 },
  whileTap: { scale: 0.98 },
  transition: liquidSpring,
};

// === List / Stagger ===
export const liquidStagger = {
  animate: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const liquidListItem = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: liquidSpring,
};

// === Layout Animation ===
export const liquidLayout = {
  layout: true as const,
  transition: liquidSpring,
};

// === Expanding Card (Apple Music style) ===
export const liquidExpand = {
  initial: { opacity: 0, scale: 0.92, borderRadius: 20 },
  animate: { opacity: 1, scale: 1, borderRadius: 0 },
  exit: { opacity: 0, scale: 0.92, borderRadius: 20 },
  transition: liquidSpring,
};

// === Backdrop ===
export const liquidBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.25 },
};
