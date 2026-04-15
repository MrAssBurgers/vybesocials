import { memo } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatPillProps {
  icon: LucideIcon;
  label: string;
  value: string;
  className?: string;
}

const itemVariant = {
  initial: { opacity: 0, y: 12, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
};

export const StatPill = memo(function StatPill({ icon: Icon, label, value, className }: StatPillProps) {
  return (
    <motion.div
      variants={itemVariant}
      className={cn(
        'liquid-glass-card rounded-xl p-3 flex items-center gap-2.5',
        className
      )}
    >
      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      </div>
    </motion.div>
  );
});
