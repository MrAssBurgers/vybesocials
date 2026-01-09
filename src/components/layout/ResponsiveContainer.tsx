import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useBreakpoint } from '@/hooks/usePlatform';

interface ResponsiveContainerProps {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  padding?: boolean;
}

const maxWidthClasses = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-screen-xl',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full',
};

export function ResponsiveContainer({ 
  children, 
  className,
  maxWidth = 'xl',
  padding = true,
}: ResponsiveContainerProps) {
  return (
    <div 
      className={cn(
        'mx-auto w-full',
        maxWidthClasses[maxWidth],
        padding && 'px-4 sm:px-6 lg:px-8',
        className
      )}
    >
      {children}
    </div>
  );
}

interface ResponsiveGridProps {
  children: ReactNode;
  className?: string;
  cols?: {
    xs?: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  gap?: 'sm' | 'md' | 'lg';
}

const gapClasses = {
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
};

export function ResponsiveGrid({ 
  children, 
  className,
  cols = { xs: 1, sm: 2, md: 3, lg: 4 },
  gap = 'md',
}: ResponsiveGridProps) {
  return (
    <div 
      className={cn(
        'grid',
        gapClasses[gap],
        cols.xs && `grid-cols-${cols.xs}`,
        cols.sm && `sm:grid-cols-${cols.sm}`,
        cols.md && `md:grid-cols-${cols.md}`,
        cols.lg && `lg:grid-cols-${cols.lg}`,
        cols.xl && `xl:grid-cols-${cols.xl}`,
        className
      )}
      style={{
        gridTemplateColumns: `repeat(var(--grid-cols, ${cols.xs || 1}), minmax(0, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

interface HideOnProps {
  children: ReactNode;
  mobile?: boolean;
  tablet?: boolean;
  desktop?: boolean;
}

export function HideOn({ children, mobile, tablet, desktop }: HideOnProps) {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  
  if (mobile && isMobile) return null;
  if (tablet && isTablet) return null;
  if (desktop && isDesktop) return null;
  
  return <>{children}</>;
}

interface ShowOnProps {
  children: ReactNode;
  mobile?: boolean;
  tablet?: boolean;
  desktop?: boolean;
}

export function ShowOn({ children, mobile, tablet, desktop }: ShowOnProps) {
  const { isMobile, isTablet, isDesktop } = useBreakpoint();
  
  const shouldShow = 
    (mobile && isMobile) || 
    (tablet && isTablet) || 
    (desktop && isDesktop);
  
  if (!shouldShow) return null;
  
  return <>{children}</>;
}

// Responsive spacing component
interface SpacerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const spacerSizes = {
  xs: 'h-2',
  sm: 'h-4',
  md: 'h-6 sm:h-8',
  lg: 'h-8 sm:h-12',
  xl: 'h-12 sm:h-16 lg:h-20',
};

export function Spacer({ size = 'md', className }: SpacerProps) {
  return <div className={cn(spacerSizes[size], className)} aria-hidden="true" />;
}
