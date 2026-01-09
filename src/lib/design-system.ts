/**
 * VYBE Design System - Unified design tokens and utilities
 * This file centralizes all design decisions for consistent UI across the app
 */

// Spacing scale (in Tailwind units)
export const spacing = {
  xs: '0.5rem',   // 2
  sm: '0.75rem',  // 3
  md: '1rem',     // 4
  lg: '1.5rem',   // 6
  xl: '2rem',     // 8
  '2xl': '3rem',  // 12
  '3xl': '4rem',  // 16
} as const;

// Border radius scale
export const radius = {
  none: '0',
  sm: '0.375rem',    // rounded-md
  md: '0.5rem',      // rounded-lg
  lg: '0.75rem',     // rounded-xl (default)
  xl: '1rem',        // rounded-2xl
  '2xl': '1.5rem',   // rounded-3xl
  full: '9999px',    // rounded-full
} as const;

// Shadow scale
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 hsl(var(--background) / 0.05)',
  md: '0 4px 6px -1px hsl(var(--background) / 0.1)',
  lg: '0 10px 15px -3px hsl(var(--background) / 0.1)',
  xl: '0 20px 25px -5px hsl(var(--background) / 0.1)',
  glow: '0 0 20px hsl(var(--primary) / 0.3)',
  'glow-lg': '0 0 40px hsl(var(--primary) / 0.4)',
} as const;

// Typography scale
export const typography = {
  // Font families
  fontFamily: {
    sans: ['Inter', 'system-ui', 'sans-serif'],
    display: ['Space Grotesk', 'system-ui', 'sans-serif'],
  },
  // Font sizes
  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
  },
  // Font weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    black: '900',
  },
  // Line heights
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },
} as const;

// Z-index scale
export const zIndex = {
  base: 0,
  dropdown: 50,
  sticky: 100,
  fixed: 200,
  modal: 300,
  popover: 400,
  tooltip: 500,
  toast: 600,
} as const;

// Animation durations
export const duration = {
  instant: '0ms',
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
} as const;

// Animation easings
export const easing = {
  default: 'cubic-bezier(0.4, 0, 0.2, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// Touch targets (minimum sizes for mobile)
export const touchTarget = {
  min: '44px',  // iOS minimum
  default: '48px', // Android minimum
} as const;

// Breakpoints
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1400px',
} as const;

// Component-specific tokens
export const components = {
  // Card styles
  card: {
    padding: {
      sm: 'p-3 sm:p-4',
      md: 'p-4 sm:p-6',
      lg: 'p-6 sm:p-8',
    },
    gap: 'gap-4',
  },
  // Button styles
  button: {
    height: {
      sm: 'h-9',
      md: 'h-10',
      lg: 'h-11',
      xl: 'h-14',
    },
    padding: {
      sm: 'px-3',
      md: 'px-4',
      lg: 'px-8',
      xl: 'px-10',
    },
  },
  // Input styles
  input: {
    height: 'h-10 sm:h-11',
    padding: 'px-4 py-2',
  },
  // Avatar sizes
  avatar: {
    xs: 'h-6 w-6',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
    '2xl': 'h-24 w-24',
    '3xl': 'h-32 w-32',
  },
  // Icon sizes
  icon: {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-8 w-8',
  },
  // Tab styles
  tabs: {
    list: 'bg-secondary rounded-xl p-1',
    trigger: 'rounded-lg px-4 py-2 text-sm font-medium',
  },
  // Badge styles
  badge: {
    padding: 'px-2.5 py-0.5',
  },
  // Sheet/Dialog
  modal: {
    padding: 'p-4 sm:p-6',
    gap: 'gap-4',
  },
} as const;

// Layout tokens
export const layout = {
  // Container max widths
  container: {
    sm: 'max-w-sm',      // 384px
    md: 'max-w-md',      // 448px
    lg: 'max-w-lg',      // 512px
    xl: 'max-w-xl',      // 576px
    '2xl': 'max-w-2xl',  // 672px
    '3xl': 'max-w-3xl',  // 768px
    '4xl': 'max-w-4xl',  // 896px
    '5xl': 'max-w-5xl',  // 1024px
    '6xl': 'max-w-6xl',  // 1152px
    '7xl': 'max-w-7xl',  // 1280px
    full: 'max-w-full',
  },
  // Common page layouts
  page: {
    padding: 'px-4 sm:px-6 lg:px-8',
    verticalPadding: 'py-4 sm:py-6',
  },
  // Grid gaps
  grid: {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6',
  },
} as const;

// Platform-specific styles
export const platform = {
  ios: {
    safeAreaTop: 'pt-safe-top',
    safeAreaBottom: 'pb-safe-bottom',
    tapTarget: 'min-h-[44px]',
  },
  android: {
    tapTarget: 'min-h-[48px]',
    ripple: 'active:bg-foreground/10',
  },
  desktop: {
    hoverState: 'hover:bg-accent/50',
  },
} as const;

// Utility class generators
export const cn = {
  // Consistent card styling
  card: (variant: 'default' | 'elevated' | 'outline' = 'default') => {
    const base = 'rounded-xl';
    const variants = {
      default: 'liquid-glass-card',
      elevated: 'liquid-glass-card shadow-lg',
      outline: 'border border-border bg-card/50',
    };
    return `${base} ${variants[variant]}`;
  },
  
  // Consistent section styling
  section: (padding: 'sm' | 'md' | 'lg' = 'md') => {
    return `${components.card.padding[padding]} ${components.card.gap}`;
  },
  
  // Consistent page wrapper
  page: () => {
    return `${layout.page.padding} ${layout.page.verticalPadding}`;
  },
} as const;
