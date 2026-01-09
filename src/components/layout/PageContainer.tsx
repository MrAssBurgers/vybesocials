import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  /** Maximum width of the container */
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
  /** Horizontal padding */
  padding?: boolean;
  /** Vertical padding */
  verticalPadding?: boolean;
  /** Center content horizontally */
  centered?: boolean;
}

const maxWidthMap = {
  xs: 'max-w-xs',      // 320px
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
};

/**
 * Consistent page container for all pages
 * Provides unified padding, max-width, and centering
 */
export function PageContainer({
  children,
  className,
  maxWidth = 'xl',
  padding = true,
  verticalPadding = true,
  centered = true,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        maxWidthMap[maxWidth],
        padding && 'px-4 sm:px-6',
        verticalPadding && 'py-4 sm:py-6',
        centered && 'mx-auto',
        className
      )}
    >
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Consistent page header styling
 */
export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between mb-6', className)}>
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          {icon}
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

interface PageSectionProps {
  children: ReactNode;
  className?: string;
  /** Section title */
  title?: string;
  /** Section description */
  description?: string;
  /** Add card styling */
  card?: boolean;
}

/**
 * Consistent page section styling
 */
export function PageSection({
  children,
  className,
  title,
  description,
  card = false,
}: PageSectionProps) {
  const content = (
    <>
      {(title || description) && (
        <div className="mb-4">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      )}
      {children}
    </>
  );

  if (card) {
    return (
      <section className={cn('liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6', className)}>
        {content}
      </section>
    );
  }

  return <section className={cn('mb-6', className)}>{content}</section>;
}

interface EmptyPageStateProps {
  emoji?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent empty state styling for pages
 */
export function EmptyPageState({
  emoji = '📭',
  title,
  description,
  action,
  className,
}: EmptyPageStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <p className="text-5xl mb-4">{emoji}</p>
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>
      )}
      {action}
    </div>
  );
}
