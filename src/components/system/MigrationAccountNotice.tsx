import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  dismissMigrationNotice,
  MIGRATION_NOTICE_BODY,
  MIGRATION_NOTICE_TITLE,
  shouldShowMigrationNotice,
} from '@/lib/migrationNotice';

interface MigrationAccountNoticeProps {
  variant: 'auth' | 'app';
  onForgotPassword?: () => void;
}

export function MigrationAccountNotice({ variant, onForgotPassword }: MigrationAccountNoticeProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(shouldShowMigrationNotice());
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    // Close immediately; storage is a best-effort persistence detail.
    queueMicrotask(dismissMigrationNotice);
  };

  const compact = variant === 'auth';
  const Icon = compact ? KeyRound : Info;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: compact ? -4 : -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: compact ? -4 : -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          role="status"
          aria-live="polite"
          className={cn(
            compact ? 'mb-2' : 'mb-3',
          )}
        >
          <div
            className={cn(
              'liquid-glass-card border border-primary/20 shadow-sm',
              compact ? 'rounded-xl p-2.5' : 'rounded-2xl p-3.5',
            )}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={cn(
                  'shrink-0 rounded-lg bg-primary/10 flex items-center justify-center text-primary',
                  compact ? 'h-7 w-7' : 'h-9 w-9',
                )}
              >
                <Icon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('font-semibold text-foreground', compact ? 'text-[11px]' : 'text-sm')}>
                  {MIGRATION_NOTICE_TITLE}
                </p>
                <p
                  className={cn(
                    'text-muted-foreground leading-snug mt-0.5',
                    compact ? 'text-[10px]' : 'text-xs',
                  )}
                >
                  {MIGRATION_NOTICE_BODY}
                </p>
                {compact && onForgotPassword && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onForgotPassword}
                    className="mt-2 h-7 rounded-full px-3 text-[10px] border-primary/30 hover:bg-primary/10"
                  >
                    Forgot password
                  </Button>
                )}
              </div>
              <button
                type="button"
                onClick={handleDismiss}
                className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 transition-colors"
                aria-label="Dismiss migration notice"
              >
                <X className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
