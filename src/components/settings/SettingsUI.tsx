import { type ReactNode, type ComponentPropsWithoutRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

/** Nested panel inside a settings card — soft glass inset */
export function SettingsPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('settings-panel rounded-xl', className)}>
      {children}
    </div>
  );
}

interface SettingsSectionCardProps {
  icon?: LucideIcon;
  iconClassName?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  delay?: number;
}

/** Standard settings section card with optional gradient icon header */
export function SettingsSectionCard({
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
  className,
  delay = 0,
}: SettingsSectionCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn('liquid-glass-card p-4 sm:p-6', className)}
    >
      {(Icon || title) && (
        <div className="flex items-start gap-4 mb-5">
          {Icon && (
            <div
              className={cn(
                'w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10',
                'ring-1 ring-primary/20 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.35)]',
                'flex items-center justify-center flex-shrink-0',
                iconClassName
              )}
            >
              <Icon className="w-5 h-5 text-primary" strokeWidth={2.25} />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-base tracking-tight">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </motion.div>
  );
}

interface SettingsToggleRowProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Clean toggle row — used inside SettingsPanel or standalone */
export function SettingsToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: SettingsToggleRowProps) {
  return (
    <div className={cn('settings-toggle-row flex items-start justify-between gap-4', className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-background/50 border border-foreground/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-primary" strokeWidth={2.25} />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-medium text-[15px] leading-tight">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
      <Switch
        aria-label={title}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-1 shrink-0"
      />
    </div>
  );
}

/** Tappable navigation row — Help, legal links, etc. */
export function SettingsActionRow({
  icon,
  iconClassName,
  title,
  description,
  onClick,
  to,
  variant = 'default',
  className,
  ...props
}: {
  icon?: ReactNode;
  iconClassName?: string;
  title: string;
  description?: string;
  onClick?: () => void;
  to?: string;
  variant?: 'default' | 'accent' | 'gold' | 'primary';
  className?: string;
} & Omit<ComponentPropsWithoutRef<'button'>, 'title' | 'onClick'>) {
  const rowClass = cn(
    'settings-action-row w-full flex items-center gap-4 p-4 rounded-xl transition-colors outline-none focus:outline-none',
    variant === 'default' && 'settings-action-row--default',
    variant === 'accent' && 'settings-action-row--accent',
    variant === 'gold' && 'settings-action-row--gold',
    variant === 'primary' && 'settings-action-row--primary',
    className
  );

  const inner = (
    <>
      {icon && (
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            iconClassName
          )}
        >
          {icon}
        </div>
      )}
      <div className="flex-1 text-left min-w-0">
        <p className="font-medium text-[15px] leading-tight">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground/70 flex-shrink-0" />
    </>
  );

  if (to) {
    return (
      <Link to={to} className={rowClass}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={rowClass} {...props}>
      {inner}
    </button>
  );
}

/** Status pill card — push enabled, announcements, etc. */
export function SettingsStatusCard({
  active,
  title,
  description,
}: {
  active: boolean;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        'settings-status-card p-4 rounded-xl border',
        active
          ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
          : 'border-foreground/[0.08] bg-foreground/[0.03]'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-2.5 h-2.5 rounded-full shrink-0',
            active ? 'bg-emerald-500 shadow-[0_0_8px_hsl(142_76%_45%/0.6)]' : 'bg-muted-foreground/50'
          )}
        />
        <div className="min-w-0">
          <p className="font-medium text-[15px]">{title}</p>
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

/** Compact list row for devices, history, etc. */
export function SettingsListRow({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 p-3 rounded-xl',
        'bg-foreground/[0.03] border border-foreground/[0.06]',
        'hover:bg-foreground/[0.05] transition-colors',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{title}</div>
        {subtitle && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</div>
        )}
      </div>
      {action}
    </div>
  );
}
