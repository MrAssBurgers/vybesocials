import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { X, Sparkles, Bookmark, Heart, Download, ArrowLeft } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ThemePreviewCanvas } from './ThemePreviewCanvas';
import { useEquipSharedTheme, useSaveSharedTheme, type SharedTheme } from '@/hooks/useSharedThemes';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import type { ThemeTokens } from '@/hooks/useCustomTheme';

interface ReceivedThemeSheetProps {
  open: boolean;
  theme: SharedTheme | null;
  onClose: () => void;
  /** Render as full page (for /theme/:id route) instead of overlay sheet */
  asPage?: boolean;
}

export function ReceivedThemeSheet({ open, theme, onClose, asPage = false }: ReceivedThemeSheetProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const equip = useEquipSharedTheme();
  const save = useSaveSharedTheme();

  const handleEquip = async () => {
    if (!theme) return;
    if (!user) { navigate('/auth'); return; }
    await equip.mutateAsync({
      id: theme.id,
      theme_tokens: theme.theme_tokens as ThemeTokens,
      theme_name: theme.theme_name,
    });
    onClose();
  };

  const handleSave = async () => {
    if (!theme) return;
    if (!user) { navigate('/auth'); return; }
    await save.mutateAsync(theme.id);
  };

  const content = theme && (
    <div className="relative h-full flex flex-col bg-background">
      {/* Close / back */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 pt-safe">
        <button
          onClick={onClose}
          className="h-10 w-10 rounded-full bg-card/80 backdrop-blur-md border border-border/40 flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Close"
        >
          {asPage ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-32 overscroll-contain touch-pan-y">
        {/* Hero preview */}
        <div className="px-5 pt-20 pb-6">
          <ThemePreviewCanvas
            tokens={theme.theme_tokens as ThemeTokens}
            themeName={theme.theme_name}
            size="lg"
            className="shadow-2xl"
          />
        </div>

        {/* Theme details */}
        <div className="px-5 space-y-4">
          <div>
            <h1 className="text-2xl font-bold leading-tight">{theme.theme_name}</h1>
            {theme.description && (
              <p className="text-sm text-muted-foreground mt-1">{theme.description}</p>
            )}
          </div>

          {/* Creator */}
          {theme.creator && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/40">
              <Avatar className="h-10 w-10">
                <AvatarImage src={theme.creator.avatar_url || undefined} />
                <AvatarFallback>
                  {(theme.creator.username || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">
                  {theme.creator.display_name || theme.creator.username}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  @{theme.creator.username}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />{theme.likes_count || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Download className="h-3 w-3" />{theme.downloads_count || 0}
                </span>
              </div>
            </div>
          )}

          {/* Color tokens row */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Palette
            </p>
            <div className="flex gap-2">
              {(['colorPrimary', 'colorSecondary', 'colorAccent', 'bgMain', 'bgCard'] as const).map(
                (key) => {
                  const v = (theme.theme_tokens as any)?.[key];
                  if (!v) return null;
                  return (
                    <div
                      key={key}
                      className="flex-1 h-12 rounded-xl border border-border/40"
                      style={{ background: `hsl(${v})` }}
                      title={key}
                    />
                  );
                }
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pt-3 bg-card border-t border-border/40 grid grid-cols-[1fr_auto] gap-2 pb-safe">
        <Button
          onClick={handleEquip}
          disabled={equip.isPending}
          className="h-12 rounded-2xl text-base font-bold bg-gradient-to-r from-primary via-primary to-accent text-primary-foreground shadow-lg shadow-primary/30"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {equip.isPending ? 'Equipping…' : 'Equip'}
        </Button>
        <button
          onClick={handleSave}
          disabled={save.isPending}
          aria-label="Just save"
          className="h-12 w-12 rounded-2xl bg-muted/40 border border-border/40 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
        >
          <Bookmark className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  if (asPage) {
    return <div className="fixed inset-0 z-50">{content}</div>;
  }

  return (
    <AnimatePresence>
      {open && theme && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100]"
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0"
          >
            {content}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
