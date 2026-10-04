import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSharedThemeById } from '@/hooks/useSharedThemes';
import { ReceivedThemeSheet } from '@/components/themes/ReceivedThemeSheet';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { stashAuthReturnPath } from '@/lib/authReturnPath';

/**
 * Public landing for unlisted theme links: /theme/:id
 */
export default function SharedThemeLink() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile } = useAuth();
  const { data: theme, isLoading, isFetching, isError, refetch } = useSharedThemeById(id);

  useEffect(() => {
    if (theme) document.title = `${theme.theme_name} · VYBE Theme`;
    else document.title = 'VYBE Theme';
  }, [theme]);

  if (loading || (user && !profile) || isLoading || isFetching) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading theme…</p>
          {user && !profile && <button className="px-4 py-2 rounded-xl text-primary" onClick={() => { void refreshProfile().catch(() => {}); }}>Retry profile</button>}
        </div>
      </div>
    );
  }

  if (!user) return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-4 p-6">
      <Sparkles className="h-10 w-10 text-primary" />
      <h1 className="text-xl font-semibold">A theme is waiting for you</h1>
      <p className="text-sm text-muted-foreground text-center">Sign in to preview and equip it. We’ll keep your place.</p>
      <button className="px-6 h-11 rounded-2xl bg-primary text-primary-foreground font-bold" onClick={() => {
        stashAuthReturnPath(`/theme/${encodeURIComponent(id || '')}`); navigate('/login');
      }}>Sign in</button>
    </div>
  );

  if (isError) return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-4 p-6">
      <Sparkles className="h-10 w-10 text-primary" />
      <h1 className="text-xl font-semibold">Could not load this theme</h1>
      <p className="text-sm text-muted-foreground">Please try again when you’re connected.</p>
      <button className="px-6 h-11 rounded-2xl bg-primary text-primary-foreground font-bold" onClick={() => void refetch()}>Retry</button>
    </div>
  );

  if (!theme) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-4 p-6 page-scroll-fix">
        <Sparkles className="h-10 w-10 text-muted-foreground" />
        <p className="text-base font-semibold">Theme not found</p>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          This theme may have been deleted, or it is no longer shared with you.
        </p>
        <button
          onClick={() => navigate('/home')}
          className="mt-2 px-6 h-11 rounded-2xl font-bold bg-primary text-primary-foreground"
        >
          Back to VYBE
        </button>
      </div>
    );
  }

  return <ReceivedThemeSheet open theme={theme} onClose={() => navigate(-1)} asPage />;
}
