import { Shield, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { forwardRef, memo, useMemo } from 'react';

interface ModBadgeProps {
  role: 'admin' | 'moderator' | null;
  className?: string;
  showLabel?: boolean;
}

/**
 * ModBadge - Renders admin/moderator badge with role-specific styling
 * On mobile/tablet: Uses enhanced drop-shadow for visibility
 */
export const ModBadge = memo(forwardRef<HTMLSpanElement, ModBadgeProps>(
  function ModBadge({ role, className, showLabel = false }, ref) {
    // Generate stable ID for mobile style injection
    const elementId = useMemo(() => `mod-badge-${Math.random().toString(36).slice(2, 9)}`, []);

    if (!role) return null;

    const isAdmin = role === 'admin';

    return (
      <>
        {/* Mobile fallback styles - enhanced visibility */}
        <style>{`
          @media (max-width: 1024px) {
            #${elementId} {
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
              opacity: 1 !important;
            }
          }
        `}</style>
        <span
          ref={ref}
          id={elementId}
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold',
            isAdmin
              ? 'bg-gradient-to-r from-red-600/30 to-rose-600/30 border border-red-500/50'
              : 'bg-gradient-to-r from-slate-400/20 to-zinc-500/20 border border-slate-400/40',
            className
          )}
          style={isAdmin ? {
            // Neon shiny red for admin
            color: 'hsl(0 100% 65%)',
            textShadow: '0 0 8px hsla(0, 100%, 60%, 0.5), 0 0 16px hsla(0, 100%, 50%, 0.3)',
          } : {
            // Silver metallic for mod  
            color: 'hsl(220 10% 75%)',
            textShadow: '0 1px 2px rgba(255,255,255,0.3)',
          }}
        >
          {isAdmin ? (
            <ShieldCheck className="h-3 w-3" style={{ filter: 'drop-shadow(0 0 4px hsla(0, 100%, 60%, 0.5))' }} />
          ) : (
            <Shield className="h-3 w-3" style={{ filter: 'brightness(1.1)' }} />
          )}
          {showLabel && <span>{isAdmin ? 'Admin' : 'Mod'}</span>}
        </span>
      </>
    );
  }
));
