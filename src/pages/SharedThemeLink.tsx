import { useParams, useNavigate } from 'react-router-dom';
import { useSharedThemeById } from '@/hooks/useSharedThemes';
import { ReceivedThemeSheet } from '@/components/themes/ReceivedThemeSheet';
import { Sparkles } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

/**
 * Public landing for unlisted theme links: /theme/:id
 * Uses get_shared_theme_by_id SECURITY DEFINER RPC so it works for any
 * authenticated user with the exact UUID.
 */
export default function SharedThemeLink() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: theme, isLoading } = useSharedThemeById(id);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading theme…</p>
        </div>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-background gap-4 p-6 page-scroll-fix">
        <Helmet>
          <title>Theme not found · VYBE</title>
        </Helmet>
        <Sparkles className="h-10 w-10 text-muted-foreground" />
        <p className="text-base font-semibold">Theme not found</p>
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          This theme may have been deleted or the link is invalid.
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

  return (
    <>
      <Helmet>
        <title>{theme.theme_name} · VYBE Theme</title>
        <meta name="description" content={theme.description || `Equip the ${theme.theme_name} VYBE theme`} />
      </Helmet>
      <ReceivedThemeSheet
        open
        theme={theme}
        onClose={() => navigate(-1)}
        asPage
      />
    </>
  );
}
