import { ReactNode, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  noPadding?: boolean;
  transparent?: boolean;
}

// Consistent section wrapper for page content
export const Section = forwardRef<HTMLElement, SectionProps>(
  function Section({ 
    children, 
    title, 
    description, 
    action,
    noPadding = false,
    transparent = false,
    className,
    ...props 
  }, ref) {
    return (
      <section
        ref={ref}
        className={cn(
          "rounded-xl",
          !transparent && "liquid-glass-card",
          !noPadding && "p-4 sm:p-5",
          className
        )}
        {...props}
      >
        {(title || description || action) && (
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {description}
                </p>
              )}
            </div>
            {action && (
              <div className="flex-shrink-0">
                {action}
              </div>
            )}
          </div>
        )}
        {children}
      </section>
    );
  }
);

// Page header with consistent styling
export function PageHeader({
  title,
  subtitle,
  backButton,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  backButton?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-center gap-3 mb-4 sm:mb-6", className)}>
      {backButton}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate">
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </header>
  );
}

// Consistent spacing wrapper
export function PageContent({
  children,
  className,
  maxWidth = '4xl',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
}) {
  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    full: 'max-w-full',
  };

  return (
    <div className={cn(
      "w-full mx-auto px-3 sm:px-4 py-3 sm:py-4",
      maxWidthClasses[maxWidth],
      className
    )}>
      {children}
    </div>
  );
}

// Grid layout helper
export function GridLayout({
  children,
  cols = 2,
  gap = 'md',
  className,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const colClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  const gapClasses = {
    sm: 'gap-2 sm:gap-3',
    md: 'gap-3 sm:gap-4',
    lg: 'gap-4 sm:gap-6',
  };

  return (
    <div className={cn(
      "grid",
      colClasses[cols],
      gapClasses[gap],
      className
    )}>
      {children}
    </div>
  );
}

// Stack layout helper
export function Stack({
  children,
  gap = 'md',
  className,
}: {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const gapClasses = {
    xs: 'space-y-1',
    sm: 'space-y-2',
    md: 'space-y-3 sm:space-y-4',
    lg: 'space-y-4 sm:space-y-6',
    xl: 'space-y-6 sm:space-y-8',
  };

  return (
    <div className={cn(gapClasses[gap], className)}>
      {children}
    </div>
  );
}
