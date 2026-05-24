import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';

interface Props {
  /** Optional username to personalize the CTA, e.g. "Join to follow @alex" */
  username?: string | null;
  /** Override CTA copy */
  context?: 'post' | 'profile';
}

/**
 * Sticky bottom banner shown to unauthenticated visitors on publicly-shared
 * pages (/p/:id, /u/:username). This is the share-to-web → signup conversion
 * surface. Hidden once the visitor authenticates.
 */
export function GuestJoinBanner({ username, context = 'post' }: Props) {
  const { user, authReady } = useAuth();
  if (!authReady || user) return null;

  const verb = context === 'profile' ? 'follow' : 'react, comment and DM';
  const target = username ? `@${username}` : 'creators you love';

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] pointer-events-none px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-white/10 bg-card/95 backdrop-blur-xl shadow-2xl p-3 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-500">
        <div className="size-10 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#06B6D4] grid place-items-center shrink-0">
          <Sparkles className="size-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Join VYBE</p>
          <p className="text-xs text-muted-foreground truncate">
            Sign up to {verb} {target}.
          </p>
        </div>
        <Link
          to="/auth"
          className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] active:scale-95 transition-transform"
        >
          Join
        </Link>
      </div>
    </div>
  );
}
