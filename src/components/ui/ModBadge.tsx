import { Shield, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModBadgeProps {
  role: 'admin' | 'moderator' | null;
  className?: string;
  showLabel?: boolean;
}

export function ModBadge({ role, className, showLabel = false }: ModBadgeProps) {
  if (!role) return null;

  const isAdmin = role === 'admin';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium',
        isAdmin
          ? 'bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30'
          : 'bg-gradient-to-r from-violet-500/20 to-purple-500/20 text-violet-400 border border-violet-500/30',
        className
      )}
    >
      {isAdmin ? (
        <ShieldCheck className="h-3 w-3" />
      ) : (
        <Shield className="h-3 w-3" />
      )}
      {showLabel && <span>{isAdmin ? 'Admin' : 'Mod'}</span>}
    </span>
  );
}
